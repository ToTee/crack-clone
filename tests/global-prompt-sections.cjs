// In-memory database and local route calls only; no AI/network requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const db = new (require('better-sqlite3'))(':memory:');
db.exec('CREATE TABLE app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)');
const root = path.resolve(__dirname, '..');
const modules = new Map();
function load(file) {
  file = path.resolve(root, file);
  if (modules.has(file)) return modules.get(file);
  const exports = {}; modules.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Response, require: name => {
    if (name === '@/lib/db') return db;
    if (name === 'next/server') return { NextResponse: Response };
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
    return require(name);
  } });
  return exports;
}
const api = load('app/api/global-prompt/route.ts');
const model = load('lib/global-prompt.ts');
const schema = load('lib/global-prompt-sections.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const rows = () => db.prepare('SELECT * FROM app_settings ORDER BY key').all();
const get = async () => {
  const res = await api.GET();
  assert.equal(res.status, 200); assert.equal(res.headers.get('Cache-Control'), 'no-store');
  return res.json();
};
const put = body => api.PUT(new Request('http://localhost/api/global-prompt', { method: 'PUT', body: JSON.stringify(body) }));
(async () => {
  let state = await get();
  assert.deepEqual(state.sections, { required: '', general: '', output: '', other: '' });
  assert.equal(state.legacy, true);
  assert.deepEqual(rows(), [], 'Viewing must not migrate or write settings');

  const original = '\n# 기존 원문\r\n한글 🌸 {user}\n  여백과 줄바꿈 유지  \n';
  let res = await put({ prompt: original, previous: '' });
  assert.equal(res.status, 200); state = await res.json();
  assert.equal(state.sections.general, original);
  const beforeGet = rows();
  assert.equal((await get()).prompt, original);
  assert.deepEqual(rows(), beforeGet);
  res = await put({ sections: state.sections, revision: state.revision });
  assert.equal(res.status, 200); state = await res.json();
  assert.equal(state.prompt, original, 'First unchanged save preserves cached prompt bytes');
  assert.equal(state.legacy, false);
  assert.equal((await put({ prompt: 'old tab overwrite', previous: original })).status, 409);

  const sections = { required: '필수 원칙 🌸', general: '일반 설정', output: '**NPC** | "대사"', other: '추가 설정' };
  const stale = state;
  res = await put({ sections, revision: state.revision });
  assert.equal(res.status, 200); state = await res.json();
  assert.deepEqual(state.sections, sections);
  const expected = '[필수]\n필수 원칙 🌸\n\n[일반]\n일반 설정\n\n[문체·형식]\n**NPC** | "대사"\n\n[기타]\n추가 설정';
  assert.equal(state.prompt, expected);
  const transmitted = model.globalPromptInstructions();
  assert.ok(transmitted.includes(expected));
  for (const content of Object.values(sections)) assert.equal(transmitted.split(content).length - 1, 1);
  assert.equal((await put({ sections: stale.sections, revision: stale.revision })).status, 409);
  assert.equal((await get()).prompt, expected);

  for (const body of [null, [], {sections:[]}, {sections:{...sections,other:9},revision:state.revision}, {sections:{...sections,extra:''},revision:state.revision}, {sections,revision:'wrong'}]) {
    assert.equal((await put(body)).status, 400);
  }
  assert.equal((await api.PUT(new Request('http://localhost', {method:'PUT',body:'{'}))).status,400);
  assert.equal((await get()).prompt, expected, 'Invalid inputs never replace saved content');

  // Failure of the second write must roll back the first (combined prompt) write.
  db.exec("CREATE TRIGGER fail_sections BEFORE UPDATE ON app_settings WHEN NEW.key='global_story_prompt_sections_v1' BEGIN SELECT RAISE(ABORT,'test'); END");
  assert.equal((await put({sections:{...sections,required:'changed'},revision:state.revision})).status,500);
  assert.equal((await get()).revision,state.revision);
  db.exec('DROP TRIGGER fail_sections');

  res=await put({sections:{required:'',general:'',output:'',other:''},revision:state.revision});
  assert.equal(res.status,200); state=await res.json();
  assert.equal(state.prompt,''); assert.equal(model.globalPromptInstructions(),'');
  assert.deepEqual((await get()).sections,plain(schema.emptyGlobalPromptSections()));

  // External/older installs may edit only the old key; never restore stale category data.
  db.prepare('UPDATE app_settings SET value=? WHERE key=?').run('수정된 예전 형식','global_story_prompt');
  state=await get();
  assert.equal(state.legacy,true); assert.equal(state.sections.general,'수정된 예전 형식');
  db.prepare('UPDATE app_settings SET value=? WHERE key=?').run('broken JSON','global_story_prompt_sections_v1');
  assert.equal((await get()).sections.general,'수정된 예전 형식');
  console.log('PASS: legacy preservation, four-field persistence, prompt composition, stale-client conflicts, empty disable, atomic rollback and read-only GET.');
  db.close();
})().catch(error=>{ console.error(error);process.exitCode=1; });
