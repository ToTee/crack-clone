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
let claudeStop = 'end_turn';
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
              yield { type: 'message_delta', delta: { stop_reason: claudeStop }, usage: { output_tokens: 50 } };
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
    Response, Request, ReadableStream, TextEncoder, TextDecoder, AbortController, setInterval, clearInterval,
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
 const stable='작품 고정 설정'.repeat(1000);
 for(const dynamic of ['키워드 A','키워드 B']){
  const result=await ai.openAiTextStream(stable+dynamic,[{role:'user',content:'질문'}],undefined,undefined,true,'s1',stable);
  for await(const part of result.text) {}
  const body=calls.at(-1).body;
  assert.equal(body.system[0].text,stable);
  assert.equal(body.system[0].cache_control.type,'ephemeral');
  assert(!body.system[1].cache_control);
  assert(body.system[1].text.startsWith(dynamic));
  assert.equal(body.max_tokens,3500);
 }
 const rows=db.prepare('SELECT * FROM ai_token_usage').all();
 assert.equal(rows.length,2);assert.equal(rows[0].cache_read_tokens,4000);assert.equal(rows[0].cache_write_tokens,20);assert.equal(rows[0].output_tokens,50);assert.equal(rows[0].completed,1);
 await ai.generateAiText('일회성 요약',[{role:'user',content:'기록'}],3000);
 assert.equal(typeof calls.at(-1).body.system,'string');
 assert.equal(db.prepare('SELECT session_id FROM ai_token_usage ORDER BY id DESC LIMIT 1').get().session_id,null);
 // Stable memory gets its own checkpoint before variable keyword context; no mixed TTL billing.
 for(const keyword of ['다인','이안']) {
  const stableMemory='보존된 사실과 약속'.repeat(200);
  const result=await ai.openAiTextStream(stable+stableMemory+keyword,[{role:'user',content:'질문'}],undefined,undefined,true,'s1',stable,undefined,stableMemory);
  for await(const _ of result.text){}
  const blocks=calls.at(-1).body.system;
  assert.equal(blocks.length,3);assert.equal(blocks[0].text,stable);assert.equal(blocks[1].text,stableMemory);
  assert.equal(blocks[1].cache_control.ttl,blocks[0].cache_control.ttl);assert.equal(blocks[2].cache_control,undefined);
 }
 // Independent checkpoints: style changes do not alter fixed content or memory.
 for(const memory of ['', '보존 기억']) for(const editable of ['문체 A','문체 B','']) {
  const tail='동적 키워드';
  const result=await ai.openAiTextStream(stable+memory+editable+tail,[{role:'user',content:'질문'}],undefined,undefined,true,'s1',stable,undefined,memory,editable);
  for await(const _ of result.text){}
  const blocks=calls.at(-1).body.system;
  assert.equal(blocks[0].text,stable);
  assert.equal(blocks.filter(b=>b.cache_control).length,1+Number(Boolean(memory))+Number(Boolean(editable)));
  assert(blocks.map(b=>b.text).join('').startsWith(stable+memory+editable+tail));
  if(memory) assert.equal(blocks[1].text,memory);
  if(editable) assert.equal(blocks[1+Number(Boolean(memory))].text,editable);
  assert(blocks.filter(b=>b.cache_control).every(b=>b.cache_control.ttl===blocks[0].cache_control.ttl));
 }
 await ai.generateAiText('구조화 기억',[{role:'user',content:'자료'}],3000,undefined,{kind:'요약',sessionId:'s1',memoryFormat:'records'});
 const schema=calls.at(-1).body.output_config.format.schema;
 assert(schema.required.includes('records'));assert(schema.required.includes('scene'));assert(schema.properties.records.items.required.includes('subject'));
 assert.equal(typeof calls.at(-1).body.system,'string'); // Summary has no chat cache overhead.
 console.log('PASS stable memory checkpoint precedes changing keywords, identical TTL billing, structured record schema, no extra summary request');
 const summaryBilling={kind:'요약',sessionId:'s1'};
 textToGenerate=JSON.stringify({title:'제목',summary:'사실',relations:'관계',goals:'목표'});
 await ai.generateAiText('요약',[{role:'user',content:'기록'}],3000,undefined,summaryBilling);
 assert.equal(calls.at(-1).body.model,'claude-sonnet-4-6');
 assert.equal(calls.at(-1).body.output_config.format.type,'json_schema');
 assert.deepEqual(Array.from(calls.at(-1).body.output_config.format.schema.required),['title','summary','relations','goals']);
 assert.equal(calls.at(-1).body.max_tokens,3000);
 const beforeFailed=calls.length;
 claudeStop='max_tokens';
 await assert.rejects(()=>ai.generateAiText('요약',[{role:'user',content:'기록'}],3000,undefined,summaryBilling),/출력 토큰 한도/);
 assert.equal(calls.length,beforeFailed+1);
 assert.equal(db.prepare('SELECT output_tokens FROM ai_token_usage ORDER BY id DESC LIMIT 1').get().output_tokens,50);
 claudeStop='refusal';
 await assert.rejects(()=>ai.generateAiText('요약',[{role:'user',content:'기록'}],3000,undefined,summaryBilling),/응답하지 않았습니다/);
 claudeStop='end_turn';
 await ai.generateAiText('일반 생성',[{role:'user',content:'기록'}],3000);
 assert.equal(calls.at(-1).body.output_config,undefined);
 console.log('PASS summary JSON schema, unchanged token cap, distinct truncation/refusal errors, single request and usage retained');
 console.log('PASS stable prefix reuse, dynamic split, unchanged output limit, NAS usage, no caching for one-off summary');db.close();
})().catch(e=>{console.error(e);db.close();process.exitCode=1});
