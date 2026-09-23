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
const calls=[]; let fail=false, hook=null;
class AiError extends Error { constructor(message,status=400) { super(message); this.status=status; } }
const ai={ AiError, describeAiError:e=>({error:e.message,status:e.status||502}), generateAiText: async(_system,messages)=>{
  calls.push(messages[0].content);
  if (hook) { const fn=hook; hook=null; await fn(); }
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
 db.prepare("INSERT INTO app_settings(key,value) VALUES('summary_interval','10')").run();
 for(let i=1;i<=9;i++)turn(i);
 assert.equal(memory.memoryContext('a').messages.length,18);
 turn(10); await memory.drainMemory('a');
 const compact=memory.memoryContext('a'); assert.equal(compact.messages.length,4);
 assert.equal(compact.diagnostics.recentTurns,2);
 assert.equal(compact.diagnostics.coveredTurns,10);
 assert.equal(compact.diagnostics.uncoveredTurns,0);
 assert.equal(compact.diagnostics.retainedCoveredTurns,2);
 assert.equal(JSON.stringify(compact.diagnostics.retainedCoveredRanges),'[[9,10]]');
 db.prepare("INSERT INTO app_settings(key,value) VALUES('recent_turns','4')").run();
 const original=memory.memoryContext('a');assert.equal(original.messages.length,8); assert.equal(original.diagnostics.recentTurns,4);
 assert.equal(compact.prompt,original.prompt);
 db.prepare("UPDATE app_settings SET value='2' WHERE key='recent_turns'").run();
 turn(11);turn(12);turn(13);
 const withUnsummarized=memory.memoryContext('a');assert.equal(withUnsummarized.messages.length,6);
 assert(withUnsummarized.messages.some(m=>m.content.startsWith('11턴')));
 assert.equal(withUnsummarized.diagnostics.uncoveredTurns,3);
 assert.equal(JSON.stringify(withUnsummarized.diagnostics.uncoveredRanges),'[[11,13]]');
 const historical=memory.memoryContext('a',db.prepare('SELECT id FROM messages WHERE session_id=? ORDER BY id LIMIT 1 OFFSET 12').get('a').id);
 assert.equal(historical.diagnostics.completedTurns,6);
 assert.equal(historical.diagnostics.coveredTurns,0);
 assert.equal(historical.diagnostics.uncoveredTurns,6);
 db.prepare("UPDATE chat_memories SET hidden=1 WHERE session_id='a' AND kind IN ('long','short')").run();
 const hidden=memory.memoryContext('a');
 assert.equal(hidden.diagnostics.coveredTurns,0);
 assert.equal(hidden.diagnostics.uncoveredTurns,13);
 assert.equal(hidden.messages.length,26);
 const kw=load('lib/keyword-book.ts');
 const config=JSON.stringify({version:1,prompt:'',template:load('lib/prompt-templates.ts').PROMPT_TEMPLATES[0].id,keywords:[{title:'A',info:'unique info',keywords:['hello'],appliedTargets:['all']},{title:'B',info:'unique info',keywords:['hello'],appliedTargets:['all']}]});
 const prompt=kw.keywordInstructions(config,0,['hello']);assert.equal(prompt.split('unique info').length-1,1);
 console.log('PASS 2/4 turn context, all unsummarized turns retained, identical summary coverage, duplicate keyword payload removed');
})().catch(e=>{console.error(e);process.exitCode=1});
