// Optional test dependency: react-test-renderer at the project's React version.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const req = require('node:module').createRequire(require.resolve('react-test-renderer'));
const React = req('react');
const { act, create } = req('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, requires, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require: requires, ...globals }, { filename: file });
  return exports;
}
const fields = load('lib/global-prompt-sections.ts', req);
const requests = [];
const Component = load('components/GlobalPromptModal.tsx', n => n === '@/lib/global-prompt-sections' ? fields : n === 'lucide-react' ? { X: () => null } : req(n), {
  AbortController,
  fetch: (url, options = {}) => {
    assert.equal(url, '/api/global-prompt', 'Browsing and editing must not invoke a model or summary endpoint.');
    return new Promise(resolve => requests.push({ options, resolve }));
  },
}).default;
const empty = () => ({ required: '', general: '', output: '', other: '' });
const response = (general, revision, extra = {}) => ({ prompt: general, sections: { ...empty(), general }, revision, legacy: false, ...extra });
const complete = async (request, body, ok = true) => act(async () => request.resolve({ ok, json: async () => body }));
let tree;
const props = { isOpen: true, onClose() {} };
const textareas = () => tree.root.findAllByType('textarea');
const save = () => tree.root.findAllByType('button').find(b => b.children.some(x => typeof x === 'string' && x.startsWith('저장')));
const edit = async (key, value) => act(() => textareas().find(t => t.props.id === `global-prompt-${key}`).props.onChange({ target: { value } }));
const reopen = async () => {
  await act(() => tree.update(React.createElement(Component, { ...props, isOpen: false })));
  await act(() => tree.update(React.createElement(Component, props)));
};

(async () => {
  await act(() => { tree = create(React.createElement(Component, props), { createNodeMock: element => element.type === 'dialog' ? { showModal() {}, close() {} } : null }); });
  assert.equal(requests.length, 1);
  assert.equal(textareas().length, 4);
  assert(save().props.disabled);
  const original = '  기존 프롬프트\n\n줄바꿈도 보존합니다.  ';
  await complete(requests[0], response(original, 'r0', { legacy: true }));
  assert.equal(textareas()[1].props.value, original);
  assert(JSON.stringify(tree.toJSON()).includes('내용 변경 없이'));
  assert.deepEqual(tree.root.findAllByType('label').map(n => n.children.join('')), ['필수', '일반', '문체·형식', '기타']);
  await edit('required', 'PC의 선택을 기다립니다.');
  await edit('output', '생활감 있는 문체.');
  await edit('other', '추가 지침.');
  await act(() => { save().props.onClick(); save().props.onClick(); });
  assert.equal(requests.length, 2, 'Double clicks must create only one save request.');
  assert(textareas().every(t => t.props.disabled));
  const body = JSON.parse(requests[1].options.body);
  assert.deepEqual(body, { sections: { required: 'PC의 선택을 기다립니다.', general: original, output: '생활감 있는 문체.', other: '추가 지침.' }, revision: 'r0' });
  await complete(requests[1], { ...response(original, 'r1'), sections: body.sections });
  assert(JSON.stringify(tree.toJSON()).includes('저장했습니다.'));
  assert(!JSON.stringify(tree.toJSON()).includes('내용 변경 없이'));

  await edit('general', '저장 충돌이 나도 남아야 할 초안');
  await act(() => { save().props.onClick(); });
  assert.equal(JSON.parse(requests[2].options.body).revision, 'r1');
  await complete(requests[2], { error: '다른 창에서 수정되었습니다. 다시 불러와 주세요.' }, false);
  assert.equal(textareas()[1].props.value, '저장 충돌이 나도 남아야 할 초안');
  assert(tree.root.findByProps({ role: 'alert' }).children.join('').includes('다른 창'));
  assert(!save().props.disabled);

  // A late read from a closed modal must not overwrite a newly opened draft.
  await reopen();
  const staleGet = requests.at(-1);
  await reopen();
  const newGet = requests.at(-1);
  assert(staleGet.options.signal.aborted);
  await complete(newGet, response('새 창의 내용', 'r2'));
  await edit('general', '새 창에서 편집한 내용');
  await complete(staleGet, response('이전 창의 늦은 응답', 'stale'));
  assert.equal(textareas()[1].props.value, '새 창에서 편집한 내용');

  // A late successful save from an externally closed modal is ignored as well.
  await act(() => { save().props.onClick(); });
  const stalePut = requests.at(-1);
  await reopen();
  assert(stalePut.options.signal.aborted);
  await complete(requests.at(-1), response('다시 불러온 최신 내용', 'r3'));
  await edit('general', '최신 창의 새 초안');
  await complete(stalePut, response('오래된 저장 응답', 'stale-put'));
  assert.equal(textareas()[1].props.value, '최신 창의 새 초안');
  assert(!JSON.stringify(tree.toJSON()).includes('저장했습니다.'));
  assert(!save().props.disabled);

  await reopen();
  await complete(requests.at(-1), { error: '불러오지 못했습니다.' }, false);
  assert(save().props.disabled, 'A failed read must not allow saving empty data over the existing prompt.');
  assert(textareas().every(t => t.props.disabled));
  assert(requests.every(r => !r.options.method || r.options.method === 'PUT'));
  await act(() => tree.unmount());
  console.log('PASS four-section prompt UI: legacy text preservation, atomic save/revision, duplicate-save guard, conflict draft retention, stale GET/PUT isolation, failed-read protection; no model requests.');
})().catch(error => { console.error(error); process.exitCode = 1; });
