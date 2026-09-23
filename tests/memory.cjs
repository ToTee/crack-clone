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
 for(let i=1;i<=9;i++)turn(i);
 await memory.drainMemory('a'); assert.equal(calls.length,0); assert.equal(memory.memorySnapshot('a').turns,9);
 turn(10); await memory.drainMemory('a');
 let state=memory.memorySnapshot('a'); assert.equal(state.summarizedTurns,10); assert.equal(state.pending,0); assert.equal(state.memories.length,3);
 assert.equal(state.memories.find(x=>x.kind==='relations').content,'서로 신뢰함');
 assert.equal(memory.memoryContext('a').messages.length,8); // Latest 4 turns kept verbatim.
 const oldCalls=calls.length; await memory.drainMemory('a'); assert.equal(calls.length,oldCalls);
 for(let i=11;i<=99;i++)turn(i);
 await memory.drainMemory('a'); state=memory.memorySnapshot('a'); assert.equal(state.summarizedTurns,90); assert.equal(state.memories.filter(x=>x.kind==='long').length,0);
 turn(100); await memory.drainMemory('a'); state=memory.memorySnapshot('a');
 assert.equal(state.memories.filter(x=>x.kind==='short').length,10); assert.equal(state.memories.filter(x=>x.kind==='long').length,1);
 assert.equal(memory.memoryContext('a').messages.length,8);
 assert(!memory.memoryContext('a').prompt.includes('[short /')); assert(memory.memoryContext('a').prompt.includes('[long /'));
 for(let i=101;i<=119;i++)turn(i);
 assert.equal(memory.memoryContext('a').messages.length,38);
 turn(120); fail=true; await memory.drainMemory('a');
 assert(memory.memorySnapshot('a').error); assert.equal(memory.memoryContext('a').messages.length,40); // Failed range still sent in full.
 fail=false; await memory.drainMemory('a'); assert.equal(memory.memoryContext('a').messages.length,8);
 assert(memory.memoryContext('a').prompt.includes('[short /'));
 assert.equal(memory.memorySnapshot('b').memories.length,0);
 let response=await api.POST(request('POST',{kind:'goals',title:'추가 목표',content:'계약서를 찾아야 함'}),ctx('a'));
 assert.equal(response.status,200); state=await response.json(); const manual=state.memories.find(x=>x.manual);
 assert(memory.memoryContext('a').prompt.includes('계약서를 찾아야 함'));
 assert.equal((await api.PATCH(request('PATCH',{id:manual.id,kind:'goals',title:'침입',content:'금지'}),ctx('b'))).status,404);
 const short=state.memories.find(x=>x.kind==='short');
 await api.PATCH(request('PATCH',{...short,title:'정정',content:'마을에 남아 있음'}),ctx('a'));
 assert.equal(memory.memorySnapshot('a').memories.filter(x=>x.kind==='long').length,0);
 assert(memory.memoryContext('a').prompt.includes('마을에 남아 있음'));
 await memory.drainMemory('a');
 const row=db.prepare("SELECT id FROM messages WHERE session_id='a' ORDER BY id LIMIT 1").get();
 db.prepare('UPDATE messages SET content=? WHERE id=?').run('원문 수정',row.id);
 memory.invalidateMemory('a'); state=memory.memorySnapshot('a');
 assert(!state.memories.some(x=>x.kind==='short'&&x.start_turn===1)); assert(!state.memories.some(x=>x.kind==='long'&&x.start_turn===1));
 assert(state.memories.some(x=>x.manual)); assert(memory.memoryContext('a').messages.some(x=>x.content==='원문 수정'));
 // Source change during paid call must not persist stale summary.
 hook=async()=> {db.prepare('UPDATE messages SET content=? WHERE id=?').run('동시 수정',row.id);memory.invalidateMemory('a');};
 await assert.rejects(memory.updateMemory('a'),/변경/);
 assert(!memory.memorySnapshot('a').memories.some(x=>x.kind==='short'&&x.start_turn===1));
 // A concurrent request sees the durable lease and does not duplicate the API call.
 hook=async()=> {const count=calls.length; const snapshot=await memory.updateMemory('a');assert(snapshot.running);assert.equal(calls.length,count);};
 await memory.updateMemory('a'); await memory.drainMemory('a');
 // Deleted short restores original source, and cannot silently reappear in a long summary.
 const deleted=memory.memorySnapshot('a').memories.find(x=>x.kind==='short'&&x.end_turn===10);
 await api.DELETE(request('DELETE',{id:deleted.id}),ctx('a'));
 await memory.drainMemory('a'); state=memory.memorySnapshot('a'); assert.equal(state.pending,0);
 assert(!state.memories.some(x=>x.kind==='long'&&x.start_turn===1)); assert(memory.memoryContext('a').messages.some(x=>x.content==='동시 수정'));
 // Branch copies only the selected prefix, never future memories from source room.
 const cutoff=db.prepare("SELECT id FROM messages WHERE session_id='a' ORDER BY id LIMIT 1 OFFSET 19").get().id;
 db.prepare("UPDATE chat_sessions SET user_note='분기용 개인 프롬프트' WHERE id='a'").run();
 const branch=await(await actions.POST(request('POST'),{params:Promise.resolve({id:'a',messageId:String(cutoff)})})).json();
 assert.equal(db.prepare('SELECT user_note FROM chat_sessions WHERE id=?').get(branch.id).user_note,'분기용 개인 프롬프트');
 assert.equal(memory.memorySnapshot(branch.id).turns,10); assert.equal(memory.memorySnapshot(branch.id).memories.length,0);
 // Upgrade compatibility: an existing 20-turn summary covers both 10-turn slots.
 const crypto=require('node:crypto');
 for(let i=1;i<=20;i++)turn(i,'b');
 memory.initMemory();
 const oldRows=db.prepare("SELECT id,role,content FROM messages WHERE session_id='b' ORDER BY id").all();
 const oldHash=crypto.createHash('sha256').update(JSON.stringify(oldRows)).digest('hex');
 db.prepare("INSERT INTO chat_memories(session_id,kind,title,content,start_turn,end_turn,source_hash) VALUES ('b','short','기존 기억','사용자가 편집한 기존 20턴 기억',1,20,?)").run(oldHash);
 const beforeMigrationCalls=calls.length;
 await memory.drainMemory('b'); assert.equal(calls.length,beforeMigrationCalls);
 assert.equal(memory.memorySnapshot('b').summarizedTurns,20);
 assert(memory.memoryContext('b').prompt.includes('사용자가 편집한 기존 20턴 기억'));
 for(let i=21;i<=100;i++)turn(i,'b');
 await memory.drainMemory('b');
 const migrated=memory.memorySnapshot('b');
 assert.equal(migrated.pending,0); assert.equal(migrated.summarizedTurns,100);
 assert.equal(migrated.memories.filter(x=>x.kind==='short').length,9); // one old 20 + eight new 10
 assert.equal(migrated.memories.filter(x=>x.kind==='long').length,1);
 // Relations edit changes the actual context, not only the UI.
 const relation=state.memories.find(x=>x.kind==='relations'&&x.end_turn===120);
 await api.PATCH(request('PATCH',{...relation,content:'서로 적대함'}),ctx('a'));
 assert(memory.memoryContext('a').prompt.includes('서로 적대함'));
 // Note migration, blank clear, remote revisions, isolation and server persistence.
 let n=await(await notes.GET(request('GET'),ctx('b'))).json(); assert.equal(n.note,null);
 n=await(await notes.PATCH(request('PATCH',{mode:'migrate',note:'이전 브라우저 노트'}),ctx('b'))).json();assert.equal(n.note,'이전 브라우저 노트');
 let other=await(await notes.PATCH(request('PATCH',{mode:'migrate',note:'다른 기기의 낡은 노트'}),ctx('b'))).json();assert.equal(other.note,n.note);
 assert.equal((await notes.PATCH(request('PATCH',{note:'충돌',revision:0}),ctx('b'))).status,409);
 let cleared=await(await notes.PATCH(request('PATCH',{note:'',revision:n.revision}),ctx('b'))).json();assert.equal(cleared.note,'');
 other=await(await notes.PATCH(request('PATCH',{mode:'migrate',note:'되살아나면 안 됨'}),ctx('b'))).json();assert.equal(other.note,'');
 assert.equal((await notes.PATCH(request('PATCH',{note:'x'.repeat(10001),revision:cleared.revision}),ctx('b'))).status,400);
 assert.equal((await notes.GET(request('GET'),ctx('missing'))).status,404);
 assert.equal(db.prepare("SELECT user_note FROM chat_sessions WHERE id='a'").get().user_note,'분기용 개인 프롬프트');
 console.log('PASS NAS notes: migration without overwrite, intentional clear, stale-write rejection, room isolation and branch copy.');
 const full=db.prepare("SELECT content FROM messages WHERE session_id='a'").all().reduce((n,m)=>n+m.content.length,0);
 const context=memory.memoryContext('a'); const compressed=context.prompt.length+context.messages.reduce((n,m)=>n+m.content.length,0);
 assert(compressed<full); console.log(`PASS memory: 9/10/99/100/120 boundaries, incremental calls, 4 recent turns, context reduction (${full} → ${compressed} characters, synthetic data), failure fallback, CRUD isolation, source edits, race/lease, branch isolation. No paid calls.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
