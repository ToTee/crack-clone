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
 await configure('anthropic',{anthropicApiKey:'sk-ant-test'});
 const stars = load('lib/stars.ts');
 stars.depositStars({amount:'20.61',key:'cache-test-initial-key',initial:true});
 assert.equal(settings.getAiSettings().cacheTtl,'1h');
 const run = async () => { const r=await ai.openAiTextStream('stable dynamic',[{role:'user',content:'hello'}],undefined,100,true,'s1','stable'); return r; };
 let r=await run();
 assert.equal(calls.at(-1).body.system[0].cache_control.ttl,'1h');
 // A settings change while a request is running must not change its price.
 await configure('anthropic',{cacheTtl:'5m'});
 for await(const _ of r.text){}
 let row=stars.listStars('이용내역','전체',0).rows[0];
 assert.equal(row.amount_nano,-3950000); // 100*5 + 50*25 + 20*10 + 4000*.5, in microdollars
 assert.equal(JSON.parse(row.pricing).cacheMinutes,60);
 r=await run();for await(const _ of r.text){}
 assert.equal(calls.at(-1).body.system[0].cache_control.ttl,'5m');
 row=stars.listStars('이용내역','전체',0).rows[0];
 assert.equal(row.amount_nano,-3875000);
 assert.equal(JSON.parse(row.pricing).cacheMinutes,5);
 await configure('anthropic',{});
 assert.equal(settings.getAiSettings().cacheTtl,'5m');
 assert.equal((await configure('anthropic',{cacheTtl:'2h'})).status,400);
 assert.equal((await apiSettings.GET()).status,200);
 assert.equal(JSON.parse(stars.listStars('이용내역','전체',0).rows[1].pricing).cacheMinutes,60);
 assert.equal(stars.priceFor('claude-sonnet-4-6','1h')[2],6);
 assert.equal(stars.priceFor('claude-haiku-4-5-20251001','1h')[2],2);
 assert.equal(stars.priceFor('claude-opus-4-6')[2],6.25);
 await ai.generateAiText('summary',[{role:'user',content:'hello'}],100,undefined,{kind:'요약'});
 assert.equal(typeof calls.at(-1).body.system,'string');
 console.log('PASS TTL default/save/validation, request TTL, in-flight pricing snapshot, both cache prices, historical records, uncached summary');
})().catch(e=>{console.error(e);process.exitCode=1});
