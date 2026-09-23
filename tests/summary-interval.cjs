// Offline memory integration tests. No user DB or paid API calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const Database = require('better-sqlite3');
const db = new Database(':memory:');
db.exec(`CREATE TABLE chat_sessions(id TEXT PRIMARY KEY,character_id TEXT,title TEXT,start_setting_index INTEGER,user_profile TEXT,updated_at TEXT);
CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT,character_id TEXT,role TEXT,content TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
INSERT INTO chat_sessions(id,character_id) VALUES('a','c'),('b','c');`);
db.exec('ALTER TABLE chat_sessions ADD COLUMN user_note TEXT; ALTER TABLE chat_sessions ADD COLUMN note_revision INTEGER DEFAULT 0;');
const calls=[]; let fail=false, hook=null, malformed=false;
class AiError extends Error { constructor(message,status=400) { super(message); this.status=status; } }
const ai={ AiError, describeAiError:e=>({error:e.message,status:e.status||502}), generateAiText: async(_system,messages)=>{
  calls.push(messages[0].content);
  if (hook) { const fn=hook; hook=null; await fn(); }
  if(malformed) return '{"title":"unfinished';
  if(fail) throw new AiError('테스트 요약 실패',502);
  return JSON.stringify({title:'여행과 약속',summary:'일행이 마을을 떠났고 다음 날 돌아오기로 약속함.',relations:'서로 신뢰함',goals:'돌아오기'});
}};
const cache=new Map();
function load(file){
 if(cache.has(file)) return cache.get(file);
 const output={}; cache.set(file,output);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{exports:output,require:n=>n==='next/server'?{after:()=>{}}:n==='@/lib/db'?db:n==='@/lib/ai'?ai:n.startsWith('@/')?load(n.slice(2)+'.ts'):require(n),Response,Request,Date,console});
 return output;
}
const memory=load('lib/memory.ts');
const api=load('app/api/chats/[id]/memory/route.ts');
const notes=load('app/api/chats/[id]/note/route.ts');
const actions=load('app/api/chats/[id]/messages/[messageId]/route.ts');
function turn(n,id='a') { for(const role of ['user','assistant']) db.prepare('INSERT INTO messages(session_id,character_id,role,content) VALUES (?,?,?,?)').run(id,'c',role,`${n}턴 ${role}: `+'긴 대화 내용. '.repeat(20)); }
function request(method,body) {return new Request('http://localhost/memory',{method,...(body?{body:JSON.stringify(body)}:{})});}
const ctx=id=>({params:Promise.resolve({id})});
(async()=>{
 db.exec('CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
 const settings=load('lib/settings.ts');
 assert.equal(settings.getAiSettings().summaryInterval,5);
 for(let i=1;i<=4;i++)turn(i);
 await memory.drainMemory('a');assert.equal(calls.length,0);
 turn(5);fail=true;
 await memory.drainMemory('a');
 assert.equal(memory.memoryContext('a').messages.length,10);
 assert.equal(memory.memoryContext('a').diagnostics.uncoveredTurns,5);
 const failedCount=calls.length;
 fail=false;
 await memory.drainMemory('a');await memory.drainMemory('a');
 assert.equal(calls.length,failedCount);
 await memory.updateMemory('a');await memory.drainMemory('a');
 assert.equal(memory.memoryContext('a').messages.length,4);
 assert.equal(memory.memoryContext('a').diagnostics.coveredTurns,5);
 db.prepare("INSERT INTO app_settings(key,value) VALUES('summary_interval','10')").run();
 for(let i=1;i<=10;i++)turn(i,'b');
 await memory.drainMemory('b');
 const old=db.prepare("SELECT id,content,source_hash FROM chat_memories WHERE session_id='b' AND kind='short'").get();
 for(let i=11;i<=17;i++)turn(i,'b');
 db.prepare("UPDATE app_settings SET value='5' WHERE key='summary_interval'").run();
 await memory.drainMemory('b');
 let ranges=()=>db.prepare("SELECT start_turn,end_turn FROM chat_memories WHERE session_id='b' AND kind='short' ORDER BY start_turn").all().map(r=>[r.start_turn,r.end_turn]);
 assert.deepEqual(ranges(),[[1,10],[11,15]]);
 assert.deepEqual(db.prepare('SELECT id,content,source_hash FROM chat_memories WHERE id=?').get(old.id),old);
 let c=memory.memoryContext('b');assert.equal(c.diagnostics.uncoveredTurns,2);assert.equal(c.messages.length,4);
 db.prepare("UPDATE app_settings SET value='10' WHERE key='summary_interval'").run();
 await memory.drainMemory('b');assert.deepEqual(ranges(),[[1,10],[11,15]]);
 for(let i=18;i<=25;i++)turn(i,'b');
 await memory.drainMemory('b');assert.deepEqual(ranges(),[[1,10],[11,15],[16,25]]);
 assert.equal(memory.memoryContext('b').diagnostics.coveredTurns,25);

 db.prepare("UPDATE chat_memories SET hidden=1 WHERE session_id='b' AND kind='short' AND start_turn=11").run();
 db.prepare("UPDATE app_settings SET value='5' WHERE key='summary_interval'").run();
 await memory.drainMemory('b');assert.deepEqual(ranges(),[[1,10],[11,15],[16,25]]);
 assert.equal(db.prepare("SELECT hidden FROM chat_memories WHERE session_id='b' AND kind='short' AND start_turn=11").get().hidden,1);
 db.prepare('INSERT INTO chat_sessions(id,character_id) VALUES(?,?)').run('bad','c');
 for(let i=1;i<=5;i++)turn(i,'bad');
 malformed=true;
 await memory.drainMemory('bad');
 assert.match(memory.memorySnapshot('bad').error,/요약 형식/);
 assert.equal(memory.memoryContext('bad').diagnostics.uncoveredTurns,5);
 const badCalls=calls.length;
 await memory.drainMemory('bad');
 assert.equal(calls.length,badCalls);
 malformed=false;
 await memory.updateMemory('bad');
 assert.equal(memory.memoryContext('bad').diagnostics.coveredTurns,5);
 // A stored cumulative memory plus three pending short blocks needs one merge.
 db.prepare('INSERT INTO chat_sessions(id,character_id) VALUES(?,?)').run('batch','c');
 for(let i=1;i<=5;i++)turn(i,'batch');
 await memory.drainMemory('batch');
 const oldLong=db.prepare("SELECT * FROM chat_memories WHERE session_id='batch' AND kind='long'").get();
 for(let i=6;i<=20;i++)turn(i,'batch');
 for(let i=0;i<3;i++)await memory.updateMemory('batch');
 assert.equal(memory.memorySnapshot('batch').pending,1);
 const beforeMerge=calls.length;
 await memory.drainMemory('batch');
 assert.equal(calls.length,beforeMerge+1);
 const mergedSource=JSON.parse(calls.at(-1));
 assert.equal(mergedSource.existingMemory,oldLong.content);
 assert.deepEqual(mergedSource.newSummaries.map(s=>[s.from,s.to]),[[6,10],[11,15],[16,20]]);
 assert.deepEqual(db.prepare("SELECT start_turn,end_turn FROM chat_memories WHERE session_id='batch' AND kind='long' ORDER BY end_turn").all().map(r=>[r.start_turn,r.end_turn]),[[1,5],[1,20]]);
 assert.deepEqual(db.prepare('SELECT * FROM chat_memories WHERE id=?').get(oldLong.id),oldLong);
 await memory.drainMemory('batch');assert.equal(calls.length,beforeMerge+1);
 // Hidden short and hidden long ranges must split the backlog into independent merges.
 for(const hiddenKind of ['short','long']) {
  const id='barrier-'+hiddenKind;
  db.prepare('INSERT INTO chat_sessions(id,character_id) VALUES(?,?)').run(id,'c');
  for(let i=1;i<=25;i++)turn(i,id);
  for(let i=0;i<5;i++)await memory.updateMemory(id);
  const middle=db.prepare("SELECT * FROM chat_memories WHERE session_id=? AND kind='short' AND start_turn=11").get(id);
  if(hiddenKind==='short')db.prepare('UPDATE chat_memories SET hidden=1 WHERE id=?').run(middle.id);
  else db.prepare("INSERT INTO chat_memories(session_id,kind,title,content,start_turn,end_turn,source_hash,hidden) VALUES (?,'long','hidden','HIDDEN',11,15,?,1)").run(id,middle.source_hash);
  assert.equal(memory.memorySnapshot(id).pending,2);
  const before=calls.length;
  await memory.drainMemory(id);
  assert.equal(calls.length,before+2);
  const sources=calls.slice(before).map(s=>JSON.parse(s));
  assert.deepEqual(sources.map(s=>s.newSummaries.map(n=>[n.from,n.to])),[[[1,5],[6,10]],[[16,20],[21,25]]]);
  assert.ok(sources.every(s=>!s.existingMemory.includes('HIDDEN')));
 }
 console.log('PASS backlog merged once to latest range, previous memory retained, repeat drain no calls, hidden short/long barriers preserved');
 console.log('PASS malformed JSON preserves raw history, stops automatic retry, explicit retry recovers');
 console.log('PASS 5-turn default/boundary, failure preserves raw history, 10→5→10 migration without duplicate summaries, old records preserved, hidden summaries respected');
})().catch(e=>{console.error(e);process.exitCode=1});
