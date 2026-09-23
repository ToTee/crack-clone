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
    if (name === 'next/server') return { after: () => {}, NextResponse: Response }; // Background summary tested in memory.cjs.
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
 const wallet=load('lib/stars.ts');
 const api=load('app/api/stars/route.ts');
 assert.equal(wallet.starsActive(),false);
 await configure('anthropic', { anthropicApiKey: 'sk-ant-test' });
 const before=await ai.openAiTextStream('test',[{role:'user',content:'test'}],undefined,100,true,'s1');
 for await(const _ of before.text) {}
 assert.equal(wallet.listStars('전체내역','전체',0).rows.length,0);
 // Starting balance never retroactively deducts already recorded usage.
 const initial={amount:'20.61',initial:true,key:'initial-1234567890'};
 wallet.depositStars(initial); wallet.depositStars(initial);
 assert.equal(wallet.listStars('전체내역','전체',0).balance,20610000000);
 assert.throws(()=>wallet.depositStars({...initial,key:'another-1234567890'}));
 const use=await ai.openAiTextStream('test',[{role:'user',content:'test'}],undefined,100,true,'s1',undefined,{kind:'재생성'});
 for await(const _ of use.text) {}
 // 100*$5 + 50*$25 + 20*$6.25 + 4000*$0.5 per million = $0.003875
 let data=wallet.listStars('전체내역','전체',0);
 assert.equal(data.balance,20610000000-3875000);
 const live=await api.GET(new Request('http://localhost/api/stars?balanceOnly=1'));
 assert.equal(live.headers.get('Cache-Control'),'no-store');
 const liveData=await live.json();
 assert.equal(liveData.balance,data.balance);
 assert.equal(liveData.rows,undefined);
 assert.equal(liveData.active,true);
 assert.equal(data.rows[0].kind,'재생성');
 assert.equal(data.rows[0].title,'테스트');
 await ai.generateAiText('summary',[{role:'user',content:'test'}],100,undefined,{kind:'요약',sessionId:'s1'});
 assert.equal(wallet.listStars('이용내역','요약',0).rows.length,1);
 streamFailure=true;
 const broken=await ai.openAiTextStream('test',[{role:'user',content:'test'}],undefined,100,true,'s1');
 await assert.rejects(async()=>{for await(const _ of broken.text){}});
 streamFailure=false;
 assert.equal(wallet.listStars('전체내역','전체',0).partial,1);
 const tracking={tracking:true,kind:'채팅',sessionId:'s1'};
 wallet.chargeUsage('unknown-request','unknown-model',{input:1,output:2,write:0,read:0},true,tracking);
 wallet.chargeUsage('unknown-request','unknown-model',{input:1,output:2,write:0,read:0},true,tracking);
 assert.equal(wallet.listStars('전체내역','전체',0).pending,1);
 const top={amount:'10.00',initial:false,key:'deposit-1234567890'};
 const preTop=wallet.starBalance().balance;
 wallet.depositStars(top); wallet.depositStars(top);
 assert.equal(wallet.starBalance().balance,preTop+10000000000);
 assert.equal(wallet.starBalance().pending,1);
 assert.equal(wallet.starBalance().partial,1);
 assert.equal(wallet.listStars('구매내역','전체',0).rows.length,2);
 assert.throws(()=>wallet.depositStars({...top,amount:'11'}));
 for(const amount of ['-1','NaN','1.001','10001','0']) assert.throws(()=>wallet.depositStars({amount,initial:false,key:'invalid-1234567890'}));
 const balance=wallet.listStars('전체내역','전체',0).balance;
 db.exec("DELETE FROM messages; DELETE FROM chat_sessions;");
 assert.equal(wallet.listStars('전체내역','전체',0).balance,balance);
 assert.equal(wallet.listStars('이용내역','再',0).rows.length,0);
 let response=await api.GET(new Request('http://localhost/api/stars'));
 assert.equal(response.status,200);
 response=await api.POST(new Request('http://localhost/api/stars',{method:'POST',headers:{origin:'https://evil.example'},body:JSON.stringify(top)}));
 assert.equal(response.status,403);
 // NAS rewrites public HTTPS :8443 to an internal HTTP host.
 response=await api.POST(new Request('http://127.0.0.1:3000/api/stars',{method:'POST',headers:{origin:'https://crack.blinkarea.synology.me:8443',host:'127.0.0.1:3000','sec-fetch-site':'same-origin'},body:JSON.stringify(top)}));
 assert.equal(response.status,200);
 response=await api.POST(new Request('http://127.0.0.1:3000/api/stars',{method:'POST',headers:{origin:'https://crack.blinkarea.synology.me:8443',host:'127.0.0.1:3000','x-forwarded-host':'crack.blinkarea.synology.me:8443'},body:JSON.stringify(top)}));
 assert.equal(response.status,200);
 response=await api.POST(new Request('http://127.0.0.1:3000/api/stars',{method:'POST',headers:{origin:'https://evil.example',host:'127.0.0.1:3000','x-forwarded-host':'evil.example','sec-fetch-site':'cross-site'},body:JSON.stringify(top)}));
 assert.equal(response.status,403);
 assert.equal(wallet.listStars('구매내역','전체',0).rows.length,2);
 for(let i=0;i<53;i++) wallet.chargeUsage('page-'+i,'claude-haiku-4-5-20251001',{input:1,output:0,write:0,read:0},true,tracking);
 assert.equal(wallet.listStars('이용내역','전체',0).rows.length,50);
 assert.equal(wallet.listStars('이용내역','전체',0).more,true);
 assert.ok(wallet.listStars('이용내역','전체',1).rows.length>0);
 console.log('PASS: initial balance, no retroactive charge, duplicate deposits, token/cache pricing, regeneration, summary, partial streams, unknown models, validation, deletion persistence, API and pagination.');
})().catch(error=>{console.error(error);process.exitCode=1});
