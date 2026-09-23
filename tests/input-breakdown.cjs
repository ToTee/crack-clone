// Offline tests: no real keys, network requests, paid API usage, or user DB writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const Database = require('better-sqlite3');
const db = new Database(':memory:');
db.exec(`
  CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE characters (id TEXT PRIMARY KEY, name TEXT, system_prompt TEXT);
  CREATE TABLE chat_sessions (id TEXT PRIMARY KEY, character_id TEXT, has_started INTEGER DEFAULT 0, user_note TEXT, note_revision INTEGER DEFAULT 0, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE messages (id INTEGER PRIMARY KEY, character_id TEXT, session_id TEXT, role TEXT, content TEXT);
  INSERT INTO characters VALUES ('c1', '테스트', 'Test system prompt');
  INSERT INTO chat_sessions (id, character_id) VALUES ('s1', 'c1'), ('s2', 'c1');
`);
db.prepare("UPDATE chat_sessions SET user_note='기억' WHERE id='s1'").run();
const calls = [];
const scheduled = [];
let failure = null;
let streamFailure = false;
let incompleteReason = null;
let textToGenerate = '안녕 🌸';
let aborts = 0;
function sdk(provider) {
  return class {
    constructor(options) {
      const create = async (body) => {
        calls.push({ provider, options, body });
        if (failure) throw failure;
        const fail = streamFailure;
        return {
          controller: { abort() { aborts++; } },
          async *[Symbol.asyncIterator]() {
            if (provider === 'openai') {
              yield { type: 'response.output_text.delta', delta: textToGenerate };
              yield incompleteReason ? { type: 'response.incomplete', response: { incomplete_details: { reason: incompleteReason } } } : { type: fail ? 'response.failed' : 'response.completed' };
            } else {
              yield { type: 'message_start', message: { usage: { input_tokens: 100, output_tokens: 0, cache_creation_input_tokens: 20, cache_read_input_tokens: 4000 } } };
              yield { type: 'message_delta', usage: { output_tokens: 50 } };
              yield { type: 'content_block_delta', delta: { type: 'text_delta', text: textToGenerate } };
              if (fail) throw new Error('SDK stream failed');
              yield { type: 'message_stop' };
            }
          },
        };
      };
      this.responses = { create };
      this.messages = { create };
    }
  };
}
const modules = new Map();
const root = path.resolve(__dirname, '..');
function load(file) {
  file = path.resolve(root, file);
  if (modules.has(file)) return modules.get(file);
  const exports = {};
  modules.set(file, exports);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const requireTest = (name) => {
    if (name === '@/lib/db') return db;
    if (name === 'next/server') return { after: fn => scheduled.push(fn), NextResponse: Response }; // Background summary tested in memory.cjs.
    if (name === 'openai') return sdk('openai');
    if (name === '@anthropic-ai/sdk') return sdk('anthropic');
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
    return require(name);
  };
  vm.runInNewContext(compiled, {
    exports, require: requireTest, process: { env: {} },
    URL, Response, Request, ReadableStream, TextEncoder, TextDecoder, AbortController, setInterval, clearInterval,
    console: { error() {} },
  }, { filename: file });
  return exports;
}
const settings = load('lib/settings.ts');
const apiSettings = load('app/api/settings/route.ts');
const ai = load('lib/ai.ts');
const chat = load('app/api/chat/route.ts');
const { consumeChatResponse } = load('lib/chat-stream.ts');
const profile = load('app/api/generate-profile/route.ts');
const examples = load('app/api/generate-examples/route.ts');
const defaults = { anthropic: 'claude-opus-4-6', openai: 'gpt-4.1' };
const request = (data) => new Request('http://localhost/api/test', { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
const configure = (provider, overrides = {}) => apiSettings.POST(request({ provider, models: defaults, anthropicApiKey: '', openaiApiKey: '', maxTokens: 3500, temperature: 0, ...overrides }));
const send = (sessionId = 's1') => chat.POST(request({ characterId: 'c1', sessionId, messages: [{ role: 'assistant', content: '프롤로그' }, { role: 'user', content: '안녕' }], userNote: 'STALE_BROWSER_NOTE', startSetting: { name: '상황B', situation: '숲' }, userProfile: { name: '사용자' }, isNovelMode: true }));
const count = () => db.prepare('SELECT COUNT(*) AS n FROM messages').get().n;


(async () => {
 await configure('anthropic',{anthropicApiKey:'sk-ant-test'});
 assert.equal(settings.getAiSettings().keywordExcludeStatus,true);
 assert.equal((await configure('anthropic',{keywordExcludeStatus:'false'})).status,400);
 await configure('anthropic',{keywordExcludeStatus:false});
 assert.equal(settings.getAiSettings().keywordExcludeStatus,false);
 await configure('anthropic',{});
 assert.equal(settings.getAiSettings().keywordExcludeStatus,false);
 await configure('anthropic',{keywordExcludeStatus:true});
 assert.equal(settings.getAiSettings().summaryInterval,5);
 assert.equal((await configure('anthropic',{summaryInterval:3})).status,400);
 await configure('anthropic',{summaryInterval:10});
 assert.equal(settings.getAiSettings().summaryInterval,10);
 await configure('anthropic',{});
 assert.equal(settings.getAiSettings().summaryInterval,10);
 await configure('anthropic',{summaryInterval:5});
 assert.equal((await (await apiSettings.GET()).json()).summaryInterval,5);
 const stars=load('lib/stars.ts');
 stars.depositStars({amount:'20.61',key:'breakdown-test-initial',initial:true});
 const keyword=load('lib/keyword-book.ts');
 const selected=[];
 const fenced='본문 복학\n```상태창\n다른\n```\n뒤 본문';
 assert.equal(keyword.keywordSearchText(fenced,'assistant',true),'본문 복학\n\n뒤 본문');
 assert.equal(keyword.keywordSearchText(fenced,'user',true),fenced);
 assert.equal(keyword.keywordSearchText(fenced,'assistant',false),fenced);
 assert.equal(keyword.keywordSearchText('앞\r\n~~~INFO\r\n다른\r\n~~~\r\n뒤','assistant',true),'앞\r\n\n뒤');
 assert.equal(keyword.keywordSearchText('앞\n```status\n다른','assistant',true),'앞\n');
 const ordinary='```text\n```상태창\n내용\n```\n뒤';
 assert.equal(keyword.keywordSearchText(ordinary,'assistant',true),ordinary);
 assert.equal(keyword.keywordSearchText('상태창이라는 단어를 말한다','assistant',true),'상태창이라는 단어를 말한다');
 assert.equal(keyword.keywordSearchText('````상태창\n```\n다른\n````\n끝','assistant',true),'\n끝');
 const config=JSON.stringify({version:1,prompt:'',template:'custom',keywords:[{title:'학교',info:'복학 🌸',keywords:['복학']},{title:'중복',info:'복학 🌸',keywords:['복학']},{title:'다른 설정',info:'다른 내용',keywords:['다른']}]});
 const prompt=keyword.keywordInstructions(config,0,['복학','다음 질문'],selected,['직전 1번째 메시지 · AI','이번 사용자 입력']);
 assert.equal(selected.length,1);
 assert.equal(selected[0].chars,4);
 assert.equal(selected[0].title,'학교');
 assert.equal(selected[0].matches[0].keyword,'복학');
 assert.deepEqual(Array.from(selected[0].matches[0].sources),['직전 1번째 메시지 · AI']);
 const both=[];
 assert.equal(keyword.keywordInstructions(config,0,['복학','복학'],both,['과거','현재']),prompt);
 assert.deepEqual(Array.from(both[0].matches[0].sources),['과거','현재']);
 const n=t=>Array.from(t).length;
 const cached='stable';const memory='요약 기억';
 const r=await ai.openAiTextStream(cached+prompt+memory,[{role:'user',content:'이전 질문'},{role:'assistant',content:'<thinking>hidden</thinking>답변 🌸'},{role:'user',content:'현재 질문'}],undefined,100,true,'s1',cached,{kind:'채팅',inputBreakdown:{cachedChars:n(cached),keywordChars:n(prompt),memoryChars:n(memory),memoryCount:1,keywords:selected}});
 for await(const _ of r.text){}
 const row=stars.listStars('이용내역','전체',0).rows[0];
 const b=JSON.parse(row.pricing).inputBreakdown;
 const sent=calls.at(-1).body;
 const system=sent.system.map(x=>x.text).join('');
 assert.equal(b.totalChars,n(system)+sent.messages.reduce((a,m)=>a+n(m.content),0));
 assert.equal(b.totalChars,b.cachedChars+b.keywordChars+b.memoryChars+b.otherChars+b.historyChars+b.requestChars);
 assert.equal(b.historyMessages,2);assert.equal(b.historyTurns,1);
 assert.equal(b.historyChars,sent.messages.slice(0,-1).reduce((a,m)=>a+n(m.content),0));
 assert.equal(b.requestChars,n('현재 질문'));
 assert.equal(row.amount_nano,-3950000); // Diagnostics must not change billing.
 db.exec('ALTER TABLE characters ADD COLUMN editor_config TEXT');
 db.prepare('UPDATE characters SET editor_config=? WHERE id=?').run(config,'c1');
 db.prepare('INSERT INTO messages(character_id,session_id,role,content) VALUES(?,?,?,?)').run('c1','s1','user','앞 질문');
 db.prepare('INSERT INTO messages(character_id,session_id,role,content) VALUES(?,?,?,?)').run('c1','s1','assistant',fenced);
 const response=await send();
 await response.text();
 const routeRow=stars.listStars('이용내역','전체',0).rows[0];
 const routeB=JSON.parse(routeRow.pricing).inputBreakdown;
 assert.ok(routeB.cachedChars>0);
 assert.equal(routeB.keywordExcludeStatus,true);
 assert.equal(routeB.keywords.length,1);
 assert.equal(routeB.keywords[0].title,'학교');
 assert.ok(calls.at(-1).body.messages.some(m=>m.content===fenced));
 assert.equal(db.prepare("SELECT content FROM messages WHERE session_id='s1' AND content=?").get(fenced).content,fenced);
 assert.equal(typeof routeB.memoryCount,'number');
 assert.equal(routeB.memory.recentTurns,2);
 assert.equal(routeB.memory.completedTurns,1);
 assert.equal(routeB.memory.uncoveredTurns,1);
 assert.equal(b.keywords[0].matches[0].keyword,'복학');
 assert.equal(routeB.totalChars,routeB.cachedChars+routeB.keywordChars+routeB.memoryChars+routeB.otherChars+routeB.historyChars+routeB.requestChars);
 // Exercise the real request builder for ordinary chat, continuation and regeneration.
 // Mocked output verifies wiring/cost bookkeeping, not the model's obedience.
 const guard=load('lib/player-agency.ts');
 assert.ok(calls.at(-1).body.system.map(x=>x.text).join('').includes(guard.playerAgencyInstructions()));
 db.exec('ALTER TABLE chat_sessions ADD COLUMN user_profile TEXT');
 db.prepare('UPDATE chat_sessions SET user_profile=? WHERE id=?').run(JSON.stringify({name:'레나',info:''}),'s2');
 async function agencySend(extra,input) {
   const before=calls.length;
   const res=await chat.POST(request({characterId:'c1',sessionId:'s2',messages:[{role:'user',content:input}],...extra}));
   assert.equal(res.status,200);
   await res.text();
   assert.equal(calls.length,before+1,'No second generation/review call');
   return calls.at(-1).body;
 }
 const agencyOrdinary=await agencySend({},'알았어요 (답장) *그때 방문이 열린다.*');
 assert.equal(agencyOrdinary.messages.at(-1).content,'알았어요 (답장) *그때 방문이 열린다.*');
 assert.ok(agencyOrdinary.system.map(x=>x.text).join('').includes(guard.playerAgencyInstructions('레나')));
 const continued=await agencySend({continueStory:true},'');
 assert.equal(continued.messages.at(-1).content,'[이어서 진행]');
 assert.ok(continued.system.map(x=>x.text).join('').includes(guard.playerAgencyInstructions('레나',true)));
 assert.equal(agencyOrdinary.system[0].text,continued.system[0].text,'Guard mode does not invalidate large setting cache');
 const target=db.prepare("SELECT id FROM messages WHERE session_id='s2' AND role='assistant' ORDER BY id DESC LIMIT 1").get().id;
 const regenerated=await agencySend({regenerateMessageId:String(target)},'ignored');
 assert.equal(regenerated.messages.at(-1).content,'[이어서 진행]');
 assert.ok(regenerated.system.map(x=>x.text).join('').includes(guard.playerAgencyInstructions('레나',true)));
 assert.equal(regenerated.system[0].text,agencyOrdinary.system[0].text);
 const newBreakdown=JSON.parse(stars.listStars('이용내역','전체',0).rows[0].pricing).inputBreakdown;
 assert.ok(newBreakdown.otherChars>=Array.from(guard.playerAgencyInstructions('레나',true)).length);
 assert.equal(newBreakdown.totalChars,newBreakdown.cachedChars+newBreakdown.keywordChars+newBreakdown.memoryChars+newBreakdown.otherChars+newBreakdown.historyChars+newBreakdown.requestChars);
 // Common prompt edits must not change the expensive first checkpoint.
 db.prepare("INSERT OR REPLACE INTO app_settings(key,value) VALUES ('global_story_prompt',?)").run('문체수정검증A');
 const styleA=await agencySend({},'계속');
 db.prepare("UPDATE app_settings SET value=? WHERE key='global_story_prompt'").run('문체수정검증B');
 const styleB=await agencySend({},'계속');
 assert.equal(styleA.system[0].text,styleB.system[0].text);
 assert(!styleA.system[0].text.includes('문체수정검증'));
 for(const [body,label] of [[styleA,'문체수정검증A'],[styleB,'문체수정검증B']]) {
   const block=body.system.find(b=>b.text.includes(label));
   assert(block.cache_control);
   assert.equal(body.system.map(b=>b.text).join('').split(label).length,2);
   assert(body.system.filter(b=>b.cache_control).length<=3);
 }
 console.log('PASS real chat route keeps fixed cache identical across common prompt edits, preserves instructions once');
 // NAS photo selection is resolved before both streaming and persistence. All
 // original conditions stay in the one main-model request, without extra calls.
 const mediaStore=load('lib/server-media.ts');
 const mediaItems=Array.from({length:320},(_,i)=>({id:`test-photo-${String(i).padStart(4,'0')}`,name:`사진${i}`,category:`인물${i%8}`,situation:'미소',hint:'실제로 미소 짓는 현재 장면에서만 사용. 화난 장면은 제외.',targetScope:'all',url:`https://example.invalid/${i}.png`}));
 mediaStore.writeMedia('c1',mediaItems,mediaStore.readMedia('c1').revision);
 const nas=load('lib/nas-media.ts').nasMediaPrompt(mediaItems);
 assert.equal(nas.diagnostics.mode,'nas');
 textToGenerate='{{mediapick:1.1}}\n**인물0** | "안녕"\n{{mediapick:1.1}}\n*미소를 지었다.*';
 const nasBody=await agencySend({},'인물0에게 인사한다.');
 const storedNas=db.prepare("SELECT content FROM messages WHERE session_id='s2' AND role='assistant' ORDER BY id DESC LIMIT 1").get().content;
 assert(!storedNas.includes('mediapick:'));
 const storedPhotoIds=[...storedNas.matchAll(/\{\{media:([^}]+)\}\}/g)].map(m=>m[1]);
 assert.equal(storedPhotoIds.length,2);
 assert.notEqual(storedPhotoIds[0],storedPhotoIds[1]);
 assert(storedPhotoIds.every(id=>mediaItems.find(item=>item.id===id)?.category==='인물0'));
 assert.equal(nasBody.max_tokens,3500,'Output setting preserved');
 assert.equal(nasBody.model,'claude-opus-4-6','Main model preserved');
 const mediaB=JSON.parse(stars.listStars('이용내역','전체',0).rows[0].pricing).inputBreakdown;
 assert.equal(mediaB.media.imageCount,320);
 assert.equal(mediaB.media.choiceCount,8);
 assert.equal(mediaB.media.sentChars,Array.from(nas.prompt).length);
 assert(mediaB.media.sentChars<mediaB.media.previousChars);
 assert(nasBody.system[0].text.includes(nas.prompt),'Shorter catalog stays in fixed cache');
 assert.equal(mediaB.totalChars,mediaB.cachedChars+mediaB.keywordChars+mediaB.memoryChars+mediaB.otherChars+mediaB.historyChars+mediaB.requestChars);
 const extraPhoto={...mediaItems[0],id:'test-photo-extra',url:'https://example.invalid/extra.png'};
 mediaStore.writeMedia('c1',[extraPhoto,...mediaItems],mediaStore.readMedia('c1').revision);
 const variantBody=await agencySend({},'그대로 대화한다.');
 assert.equal(variantBody.system[0].text,nasBody.system[0].text,'Adding an equivalent photo leaves fixed cache unchanged');
 textToGenerate='{{media:test-photo-extra}}\n*같은 사진을 가리켰다.*';
 await agencySend({},'이 사진을 사용해 주세요. {{media:test-photo-extra}}');
 assert(db.prepare("SELECT content FROM messages WHERE session_id='s2' AND role='assistant' ORDER BY id DESC LIMIT 1").get().content.includes('{{media:test-photo-extra}}'));
 textToGenerate='안녕 🌸';
 console.log('PASS NAS selection request, stable variant cache, exact requested photo, restored IDs saved, unchanged model/output and correct cost diagnostics');
 const scheduledBefore=scheduled.length, callsBefore=calls.length;
 const roomApi=load('app/api/chats/[id]/route.ts');
 const memoryApi=load('app/api/chats/[id]/memory/route.ts');
 for(let i=0;i<3;i++) {
   assert.equal((await roomApi.GET(new Request('http://localhost/api/chats/s1'),{params:Promise.resolve({id:'s1'})})).status,200);
   assert.equal((await memoryApi.GET(new Request('http://localhost/api/chats/s1/memory'),{params:Promise.resolve({id:'s1'})})).status,200);
 }
 assert.equal(scheduled.length,scheduledBefore);
 assert.equal(calls.length,callsBefore);
 console.log('PASS reads do not schedule paid work; actual request composition, Unicode counts, keyword deduplication, ledger persistence, unchanged charges, chat route diagnostics');
})().catch(e=>{console.error(e);process.exitCode=1});
