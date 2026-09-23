// In-memory integration; the provider is mocked. No paid calls or user files.
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript'),DB=require('better-sqlite3');
const db=new DB(':memory:');
db.exec(`CREATE TABLE chat_sessions(id TEXT PRIMARY KEY,character_id TEXT,user_profile TEXT);CREATE TABLE characters(id TEXT PRIMARY KEY,editor_config TEXT);CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT,role TEXT,content TEXT);CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT);INSERT INTO chat_sessions VALUES('a','c',NULL),('b','c',NULL);INSERT INTO characters VALUES('c','{}');`);
let calls=0, malformed=false;
class AiError extends Error{constructor(m,status=400){super(m);this.status=status;}}
const ai={AiError,describeAiError:e=>({error:e.message,status:e.status||502}),generateAiText:async(system,messages,max,signal,billing)=>{
 calls++;assert.equal(billing.memoryFormat,'records');const source=JSON.parse(messages[0].content);const t=Number(source.messages.at(-1).content.match(/turn=(\d+)/)[1]);
 if(malformed)return JSON.stringify({title:'오류',summary:'잘못된 기억',relations:'',goals:'',records:[{}],scene:''});
 return JSON.stringify({title:`사건 ${t}`,summary:t===5?'푸른 열쇠를 분수대 아래에 숨겼다.':'다른 사건 '+t,relations:'',goals:'',scene:`이안과 레나가 방에서 대화하며 답장을 기다림 ${t}`,records:[
 {kind:'facts',subject:'은연희',key:'직책',content:'은연희는 대표다.',people:['은연희'],state:'active'},
 {kind:'relations',subject:'이안',key:'레나와의 관계',content:t===5?'레나를 경계함':'레나를 신뢰함',people:['이안','레나'],state:'active'},
 {kind:'relations',subject:'레나',key:'이안과의 관계',content:'이안의 비밀은 전달받지 않음',people:['레나','이안'],state:'active'},
 {kind:'goals',subject:'레나',key:'약 구매',content:t===5?'월요일에 약을 사기로 약속함':'약을 구매해 전달함',people:['레나','이안'],state:t===5?'active':'resolved'}]});}};
const modules={};function load(file){if(modules[file])return modules[file];const exports={};modules[file]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,require:n=>n==='@/lib/db'?db:n==='@/lib/ai'?ai:n==='next/server'?{after(){}}:n.startsWith('@/')?load(n.slice(2)+'.ts'):require(n),Response,Request,URL,console});return exports;}
const mem=load('lib/memory.ts'),api=load('app/api/chats/[id]/memory/route.ts'),records=load('lib/memory-records.ts');
const userQuotedPlan='The user is again giving a vague action about 보라색 암호. I should have the NPC respond.\n\n*인용문 끝.*';
function turn(n,id='a'){db.prepare('INSERT INTO messages(session_id,role,content) VALUES(?,?,?)').run(id,'user',n===2?userQuotedPlan:'질문 '+n);db.prepare('INSERT INTO messages(session_id,role,content) VALUES(?,?,?)').run(id,'assistant',`**이안** | "대답" ${n===2?'푸른 열쇠는 분수대 아래 세 번째 돌 밑이다.':''} turn=${n}`);}
const req=(method,body)=>new Request('http://localhost/test',{method,body:JSON.stringify(body)}),ctx={params:Promise.resolve({id:'a'})};
(async()=>{
 for(let n=1;n<=5;n++)turn(n);const rawBefore=JSON.stringify(db.prepare('SELECT * FROM messages').all());await mem.drainMemory('a');assert.equal(calls,1);assert.equal(JSON.stringify(db.prepare('SELECT * FROM messages').all()),rawBefore);
 let snapshot=mem.memorySnapshot('a');assert.equal(snapshot.pending,0);assert.equal(snapshot.memories.filter(m=>m.kind==='relations').length,2);assert.deepEqual(Array.from(snapshot.relationGroups,g=>g.name).sort(),['레나','이안']);assert(!snapshot.memories.some(m=>m.kind==='long'));
 let context=mem.memoryContext('a');assert(context.stablePrompt.includes('은연희는 대표다'));assert(context.stablePrompt.includes('월요일'));assert(context.dynamicPrompt.includes('답장을 기다림'));await mem.drainMemory('a');assert.equal(calls,1);
 for(let n=6;n<=10;n++)turn(n);await mem.drainMemory('a');assert.equal(calls,2);context=mem.memoryContext('a');assert(!context.stablePrompt.includes('경계함'));assert(context.stablePrompt.includes('신뢰함'));assert(!context.stablePrompt.includes('월요일'));assert.equal(db.prepare("SELECT COUNT(*) n FROM chat_memories WHERE kind='goals'").get().n,2);
 const cutoff=db.prepare("SELECT id FROM messages WHERE content='질문 6'").get().id;context=mem.memoryContext('a',cutoff,'약속 기억해?');assert(context.stablePrompt.includes('경계함'));assert(context.stablePrompt.includes('월요일'));assert(!context.stablePrompt.includes('신뢰함'));
 for(let n=11;n<=40;n++)turn(n);await mem.drainMemory('a');assert.equal(calls,8);assert.equal(mem.memorySnapshot('a').pending,0);context=mem.memoryContext('a',undefined,'예전 푸른 열쇠를 어디 숨겼지?');assert(context.dynamicPrompt.includes('세 번째 돌'));assert(context.diagnostics.recalledTurns.includes(2));assert(context.diagnostics.retrievedCount<context.diagnostics.archiveCount);assert.equal(mem.memoryContext('b').prompt,'');context=mem.memoryContext('a',undefined,'예전 보라색 암호 기억해?');assert(context.dynamicPrompt.includes(userQuotedPlan),'User-authored quoted planning text must survive historical recall');
 const latest=mem.memorySnapshot('a').memories.filter(m=>m.kind==='relations'&&m.subject==='이안').at(-1);await api.PATCH(req('PATCH',{...latest,content:'레나를 경계하며 비밀을 모름'}),ctx);assert(mem.memoryContext('a').stablePrompt.includes('비밀을 모름'));await api.DELETE(req('DELETE',{id:latest.id}),ctx);assert(!mem.memoryContext('a').stablePrompt.includes('신뢰함'));const before=calls;await mem.drainMemory('a');assert.equal(calls,before);
 const groups=records.relationGroups([{id:1,kind:'relations',title:'1~5턴 요약',content:'이안은 레나를 경계함',start_turn:1,end_turn:5,manual:0}],['이안','레나','린']);assert.deepEqual(Array.from(groups,g=>g.name),['이안','레나']);
 for(let n=41;n<=45;n++)turn(n);malformed=true;await mem.drainMemory('a');assert.match(mem.memorySnapshot('a').error,/형식/);assert.equal(mem.memoryContext('a').diagnostics.uncoveredTurns,5);const failed=calls;await mem.drainMemory('a');assert.equal(calls,failed);
 console.log('PASS one extraction per 5 turns, no long merge calls, immutable source, per-person relationships, state supersession, resolved goals, historical evidence recall, regeneration cutoff, room isolation, edit/hide without resurrection, failure raw fallback and retry stop.');
})().catch(e=>{console.error(e);process.exitCode=1});
