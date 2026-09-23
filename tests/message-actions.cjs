const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const Database = require('better-sqlite3');
const db = new Database(':memory:');
db.exec(`
  CREATE TABLE chat_sessions (id TEXT PRIMARY KEY, character_id TEXT, title TEXT, start_setting_index INTEGER, user_profile TEXT, updated_at TEXT);
  CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, character_id TEXT, session_id TEXT, role TEXT, content TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  INSERT INTO chat_sessions VALUES ('a','c','원본',2,'{"name":"프로필"}',NULL), ('b','c','다른 채팅',0,NULL,NULL);
  INSERT INTO messages (character_id,session_id,role,content) VALUES
    ('c','a','assistant','프롤로그'), ('c','a','user','질문'), ('c','a','assistant','답변'), ('c','b','assistant','다른 채팅');
`);
db.exec('ALTER TABLE chat_sessions ADD COLUMN user_note TEXT; ALTER TABLE chat_sessions ADD COLUMN note_revision INTEGER DEFAULT 0;');
const code = ts.transpileModule(fs.readFileSync('app/api/chats/[id]/messages/[messageId]/route.ts','utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
}).outputText;
const output = {};
vm.runInNewContext(code, { exports: output, require: name => name === '@/lib/db' ? db : name === '@/lib/memory' ? { invalidateMemory() {} } : require(name), Response, Number });
const ctx = (id, messageId) => ({ params: Promise.resolve({ id, messageId: String(messageId) }) });
const req = content => new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ content }) });
(async () => {
  assert.equal((await output.PATCH(req('변경'),ctx('a',4))).status,404);
  assert.equal((await output.PATCH(req('  '),ctx('a',2))).status,400);
  const edited = await (await output.PATCH(req('수정 **내용**'),ctx('a',2))).json();
  assert.equal(edited.messages[1].content,'수정 **내용**');
  const branch = await (await output.POST(new Request('http://localhost'),ctx('a',2))).json();
  const copied = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id').all(branch.id);
  assert.equal(copied.length,2);
  assert.equal(copied[1].content,'수정 **내용**');
  assert.notEqual(copied[0].id,1);
  const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(branch.id);
  assert.equal(session.start_setting_index,2);
  assert.equal(session.user_profile,'{"name":"프로필"}');
  await output.DELETE(new Request('http://localhost'),ctx('a',2));
  assert.deepEqual(db.prepare('SELECT id FROM messages WHERE session_id = ? ORDER BY id').all('a').map(m=>m.id),[1,3]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages WHERE session_id = ?').get(branch.id).n,2);
  assert.equal((await output.DELETE(new Request('http://localhost'),ctx('a',4))).status,404);
  await output.DELETE(new Request('http://localhost'),ctx('a',1));
  const empty = await (await output.DELETE(new Request('http://localhost'),ctx('a',3))).json();
  assert.deepEqual(empty.messages,[]);
  assert.equal((await output.POST(new Request('http://localhost'),ctx('a',3))).status,404);
  console.log('PASS: edit, blank validation, room isolation, branch prefix/profile, independent copies, single deletion and empty history. No user DB or API calls.');
  db.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
