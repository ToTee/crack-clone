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
    Response, Request, ReadableStream, TextEncoder, TextDecoder, AbortController,
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
  assert.equal(settings.getAiSettings().provider, 'anthropic');
  assert.throws(() => ai.resolveAi(), /API 키가 없습니다/);
  // Legacy wrongly filed key is recovered, never sent to Anthropic.
  db.prepare('INSERT INTO app_settings (key,value) VALUES (?,?)').run('anthropic_api_key', 'sk-proj-test-secret-openai');
  assert.equal(settings.getAiSettings().anthropicApiKey, '');
  assert.equal(settings.getAiSettings().openaiApiKey, 'sk-proj-test-secret-openai');
  assert.throws(() => ai.resolveAi(), /API 키가 없습니다/);
  assert.equal((await configure('openai')).status, 200);
  assert.equal(db.prepare('SELECT value FROM app_settings WHERE key = ?').get('openai_api_key').value, 'sk-proj-test-secret-openai');
  assert.equal(settings.getAiSettings().temperature, 0);
  console.log('PASS: legacy recovery, separate persistent keys, temperature=0');

  const mediaStore = load('lib/server-media.ts');
  mediaStore.writeMedia('c1', [
    { id: 'scene-test', name: '에리_기쁨.jpg', category: '에리', situation: '기쁨', targetScope: 'default', url: 'data:image/png;base64,PRIVATE_PIXELS' },
    { id: 'excluded-scene', name: 'other.jpg', targetScope: 'extra1', url: 'data:image/png;base64,OTHER_PIXELS' },
  ], 0);
  let output = '';
  await consumeChatResponse(await send(), (text) => { output = text; });
  assert.equal(output, textToGenerate);
  assert.equal(count(), 2);
  assert.equal(calls.at(-1).provider, 'openai');
  assert.equal(calls.at(-1).options.apiKey, 'sk-proj-test-secret-openai');
  assert.equal(calls.at(-1).options.baseURL, 'https://api.openai.com/v1');
  assert.equal(calls.at(-1).body.store, false);
  assert.equal(calls.at(-1).body.temperature, 0);
  assert.match(calls.at(-1).body.instructions, /상황B/);
  assert.match(calls.at(-1).body.instructions, /기억/);
  assert(!calls.at(-1).body.instructions.includes('STALE_BROWSER_NOTE'));
  assert.match(calls.at(-1).body.instructions, /scene-test/);
  assert.match(calls.at(-1).body.instructions, /기쁨/);
  assert(!calls.at(-1).body.instructions.includes('PRIVATE_PIXELS'));
  assert(!calls.at(-1).body.instructions.includes('excluded-scene'));
  console.log('PASS: GPT streaming, NAS media catalog without image bytes, scope filter, saved turn');

  assert.equal((await configure('anthropic', { anthropicApiKey: 'sk-ant-test-secret-claude' })).status, 200);
  await consumeChatResponse(await send('s2'), () => {});
  assert.equal(count(), 4);
  assert.equal(calls.at(-1).provider, 'anthropic');
  assert.equal(calls.at(-1).options.apiKey, 'sk-ant-test-secret-claude');
  assert.equal(calls.at(-1).options.baseURL, 'https://api.anthropic.com');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages WHERE session_id = ?').get('s2').n, 2);
  assert.equal(settings.getAiSettings().openaiApiKey, 'sk-proj-test-secret-openai');
  assert.match(calls.at(-1).body.system, /scene-test/);
  console.log('PASS: Claude streaming, NAS media catalog, provider switch, room isolation');

  const publicText = JSON.stringify(await (await apiSettings.GET()).json());
  assert.ok(!publicText.includes('sk-proj-') && !publicText.includes('sk-ant-'));
  assert.equal((await configure('anthropic', { anthropicApiKey: 'sk-proj-wrong-slot' })).status, 400);
  assert.equal((await configure('openai', { openaiApiKey: 'sk-ant-wrong-slot' })).status, 400);
  assert.equal((await configure('bad')).status, 400);
  assert.equal(settings.getAiSettings().provider, 'anthropic');
  console.log('PASS: masked settings, wrong-provider key validation, atomic settings');

  for (const provider of ['openai', 'anthropic']) {
    await configure(provider);
    const before = count();
    failure = { status: 401, message: 'do not expose sk-proj-secret' };
    const response = await send();
    assert.equal(response.status, 401);
    await assert.rejects(consumeChatResponse(response, () => {}), /인증/);
    assert.equal(count(), before);
    failure = null;
    streamFailure = true;
    await assert.rejects(consumeChatResponse(await send(), () => {}));
    assert.equal(count(), before);
    streamFailure = false;
  }
  const error = ai.describeAiError({ status: 429, code: 'insufficient_quota', message: 'secret' }, 'openai');
  assert.match(error.error, /잔액/);
  assert.ok(!error.error.includes('secret'));
  assert.equal((await send('nonexistent')).status, 404);
  console.log('PASS: authentication, quota and mid-stream failure; no failed turns saved');

  await configure('openai', { models: { ...defaults, openai: 'gpt-5.4' } });
  await consumeChatResponse(await send(), () => {});
  assert.equal('temperature' in calls.at(-1).body, false);
  for (const provider of ['anthropic', 'openai']) {
    await configure(provider);
    textToGenerate = '{"name":"테스트","tagline":"한 줄 소개","keyword":"forest"}';
    const result = await profile.POST(request({}));
    assert.equal(result.status, 200);
    assert.equal((await result.json()).name, '테스트');
    assert.equal(calls.at(-1).provider, provider);
    textToGenerate = '[{"user":"안녕","assistant":"반가워"}]';
    const example = await examples.POST(request({ name: '테스트' }));
    assert.equal(example.status, 200);
    assert.equal((await example.json()).examples.length, 1);
    assert.equal(calls.at(-1).provider, provider);
  }
  console.log('PASS: model-specific sampling, both AI generation tools on both providers');

  // Arbitrarily split Korean/emoji bytes and multiple frames in one read.
  const bytes = new TextEncoder().encode(JSON.stringify({ type: 'delta', text: '한글 🌸' }) + '\n' + JSON.stringify({ type: 'done' }) + '\n');
  let index = 0;
  const fragmented = new Response(new ReadableStream({ pull(controller) { if (index === bytes.length) controller.close(); else controller.enqueue(bytes.slice(index, ++index)); } }), { headers: { 'Content-Type': 'application/x-ndjson' } });
  await consumeChatResponse(fragmented, (text) => { output = text; });
  assert.equal(output, '한글 🌸');
  const truncated = new Response('{"type":"delta","text":"partial"}\n', { headers: { 'Content-Type': 'application/x-ndjson' } });
  await assert.rejects(consumeChatResponse(truncated, () => {}), /응답 완료/);
  assert.ok(aborts > 0);
  console.log('PASS: fragmented UTF-8, missing completion, upstream cleanup');
  db.prepare("INSERT INTO chat_memories(session_id,kind,title,content,manual) VALUES ('s1','goals','목표','보물을 찾아야 함',1)").run();
  textToGenerate = '기억을 참고한 답변';
  await consumeChatResponse(await send(), () => {});
  assert.match(calls.at(-1).body.instructions, /보물을 찾아야 함/);
  assert(!calls.at(-1).body.input.some(m => m.content === '프롤로그')); // Ignore untrusted client history.
  console.log('PASS: chat route uses NAS history and injects room memory into the actual provider request');
  await consumeChatResponse(await chat.POST(request({ characterId: 'c1', sessionId: 's1', continueStory: true, messages: [{role:'user',content:''}] })), () => {});
  assert.match(calls.at(-1).body.instructions, /이번 요청: 이어서 진행/);
  assert.equal(calls.at(-1).body.input.at(-1).content, '[이어서 진행]');
  assert.equal(db.prepare("SELECT has_started FROM chat_sessions WHERE id='s1'").get().has_started, 1);
  assert.equal((await chat.POST(request({ characterId:'c1',sessionId:'s1',messages:[{role:'user',content:''}] }))).status,400);
  console.log('PASS: empty-input continuation, persistent first-turn flag, ordinary blank validation');
  await configure('openai');
  incompleteReason = 'max_output_tokens';
  textToGenerate = '출력 한도에서 멈춘 답변 일부';
  const beforeLimited = count();
  await consumeChatResponse(await send(), text => { output = text; });
  assert.equal(output, textToGenerate);
  assert.equal(count(), beforeLimited + 2);
  assert.equal(db.prepare('SELECT content FROM messages ORDER BY id DESC LIMIT 1').get().content, textToGenerate);
  await assert.rejects(ai.generateAiText('요약', [{role:'user',content:'요약해'}], 100));
  incompleteReason = 'content_filter';
  const beforeOther = count();
  await assert.rejects(consumeChatResponse(await send(), () => {}));
  assert.equal(count(), beforeOther);
  incompleteReason = 'max_output_tokens'; textToGenerate = '';
  await assert.rejects(consumeChatResponse(await send(), () => {}), /비어/);
  assert.equal(count(), beforeOther);
  incompleteReason = null;
  console.log('PASS: output-limit partial answer reaches client and persists; empty output and other failures remain errors; structured generation stays strict.');
  db.close();
  console.log('ALL OFFLINE TESTS PASSED (no external requests)');
})().catch((error) => { console.error(error); db.close(); process.exitCode = 1; });
