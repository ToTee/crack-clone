const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const Database = require('better-sqlite3');
const db = new Database(':memory:');
db.exec(`
  CREATE TABLE characters(id TEXT PRIMARY KEY);
  CREATE TABLE chat_sessions(id TEXT PRIMARY KEY, character_id TEXT, title TEXT,
    start_setting_index INTEGER, user_profile TEXT, created_at TEXT, updated_at TEXT);
  CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, role TEXT, content TEXT, created_at TEXT);
  INSERT INTO characters VALUES('story'), ('empty'), ('drafts');
`);
const load = (file, imports) => {
  const output = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports: output, require: name => imports[name] || require(name), Response });
  return output;
};
const latest = load('lib/latest-story-chat.ts', { '@/lib/db': db }).latestStoryChat;
const room = (id, story, created, updated, setting = 0, profile = null) => {
  db.prepare('INSERT INTO chat_sessions VALUES (?,?,?,?,?,?,?)').run(id, story, `제목 ${id}`, setting, profile, created, updated);
};
const message = (id, role, at) => db.prepare('INSERT INTO messages(session_id,role,content,created_at) VALUES (?,?,?,?)').run(id, role, '내용', at);
room('old', 'story', '2026-09-19 10:00:00', '2026-09-20 14:00:00');
message('old', 'user', '2026-09-20 09:00:00'); message('old', 'assistant', '2026-09-20 09:01:00');
room('last', 'story', '2026-09-19 11:00:00', '2026-09-20 10:01:00', 3, '{"name":"다른 프로필"}');
message('last', 'user', '2026-09-20 10:00:00'); message('last', 'assistant', '2026-09-20 10:01:00');
room('fresh', 'story', '2026-09-20 15:00:00', '2026-09-20 15:00:00');
message('fresh', 'assistant', '2026-09-20 15:00:00');
room('unrelated', 'elsewhere', '2026-09-20 15:00:00', '2026-09-20 15:00:00');
message('unrelated', 'user', '2026-09-20 16:00:00');
assert.equal(latest('story').id, 'last', 'latest actual conversation wins, regardless of changed updated_at, selected setting/profile or fresh prologue');
assert.equal(latest('empty'), null);
room('draft1', 'drafts', '2026-09-20 08:00:00', '2026-09-20 12:00:00');
room('draft2', 'drafts', '2026-09-20 09:00:00', '2026-09-20 09:00:00');
assert.equal(latest('drafts').id, 'draft2', 'with no played room, an existing latest-created room can still be continued');
room('branch', 'story', '2026-09-20 17:00:00', '2026-09-20 17:00:00');
message('branch', 'user', '2026-09-20 10:00:00'); message('branch', 'assistant', '2026-09-20 10:01:00');
assert.equal(latest('story').id, 'last', 'copied history alone does not outrank the source conversation');
db.exec('CREATE TABLE chat_generation(session_id TEXT PRIMARY KEY, updated INTEGER, status TEXT)');
db.prepare('INSERT INTO chat_generation VALUES (?,?,?)').run('old', Date.parse('2026-09-20T18:00:00Z'), 'running');
assert.equal(latest('story').id, 'old', 'an in-flight response is the latest played room before messages are saved');
db.prepare('UPDATE chat_generation SET status=? WHERE session_id=?').run('complete', 'old');
assert.equal(latest('story').id, 'old', 'completion preserves latest generation activity');
db.prepare('DELETE FROM chat_sessions WHERE id=?').run('old');
assert.equal(latest('story').id, 'last', 'deleted room is excluded even if generation history remains');

const route = load('app/api/characters/[id]/latest-chat/route.ts', {
  '@/lib/db': db, '@/lib/latest-story-chat': { latestStoryChat: latest },
  'next/server': { NextResponse: { json: Response.json } },
});
(async () => {
  const before = db.prepare('SELECT total_changes() AS count').get().count;
  const response = await route.GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'story' }) });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).chat.id, 'last');
  assert.equal((await (await route.GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'empty' }) })).json()).chat, null);
  assert.equal((await route.GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'missing' }) })).status, 404);
  assert.equal(db.prepare('SELECT total_changes() AS count').get().count, before, 'resume lookup never mutates chat settings or history');
  const page = fs.readFileSync('app/character/[id]/page.tsx', 'utf8');
  assert.ok(page.indexOf('onClick={handleContinue}') < page.indexOf('onClick={handleStart}'), 'continue button is left of new button');
  assert.ok(!page.includes('이 설정으로 새 대화 시작'));
  const handler = page.slice(page.indexOf('const handleContinue ='), page.indexOf('const handleStart ='));
  assert.ok(handler.includes('await readLatestChat(') && handler.includes('router.push('), 'resume refreshes on click and navigates');
  assert.ok(!handler.includes("method: 'POST'") && !handler.includes('selectedSettingIndex') && !handler.includes('selectedProfileId'));
  console.log('PASS: story-scoped latest actual chat, settings/profile independence, prologue-only fallback, copied branch ties, active generation, deletion, no-store/read-only API and action placement. No AI calls.');
  db.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
