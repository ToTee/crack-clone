const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// This unit loader permits only pure source dependencies, never DB/network APIs.
const modules = new Map();
const loadedFiles = new Set();
function load(file) {
  const full = path.resolve(__dirname, '..', file);
  if (modules.has(full)) return modules.get(full);
  const exports = {};
  modules.set(full, exports); loadedFiles.add(file);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports,
    require(name) {
      assert(name.startsWith('@/lib/'), 'selection must remain a pure local function: ' + name);
      return load(name.replace('@/', '') + '.ts');
    },
  });
  return exports;
}
const { nasMediaPrompt } = load('lib/nas-media.ts');
const { compactMediaPrompt } = load('lib/compact-media.ts');
const { automaticMedia } = load('lib/chat-media.ts');

const scenarios = ['일반', '미소', '분노', '피곤함', '걱정', '놀람'];
const synthetic = Array.from({ length: 12 }, (_, category) => scenarios.flatMap((situation, scene) =>
  Array.from({ length: 4 }, (_, variant) => ({
    id: `photo-${category}-${scene}-${variant}`,
    name: `인물${category}_${situation}_${variant}.jpg`,
    category: `인물${category}`, situation,
    hint: `${situation} 상태인 본인이 현재 등장하는 장면에서만 사용합니다. 회상·다른 인물·반대 감정은 제외합니다.`,
    targetScope: 'all', url: `/local/${category}/${scene}/${variant}.jpg`,
  })))).flat();
const originalSnapshot = JSON.stringify(synthetic);
for (const item of synthetic) Object.freeze(item);
Object.freeze(synthetic);
const base = nasMediaPrompt(synthetic);
assert.equal(base.diagnostics.mode, 'nas');
assert.equal(base.diagnostics.imageCount, 288);
assert.equal(base.diagnostics.choiceCount, 72);
assert(base.diagnostics.sentChars < base.diagnostics.previousChars);
assert.equal(base.diagnostics.sentChars, Array.from(base.prompt).length);
assert.equal(base.diagnostics.previousChars, Array.from(compactMediaPrompt(synthetic).prompt).length);
assert(!base.prompt.includes('photo-'), 'the catalog must not send actual photo IDs');
assert(!base.prompt.includes('/local/'), 'the catalog must not send image URLs');

function catalog(context) { return JSON.parse(context.prompt.trim().split('\n').at(-1)); }
function expectedCondition(item) {
  return [item.situation?.trim() || '일반', ...(item.hint?.trim() ? [item.hint.trim()] : [])];
}
function assertRoundTrip(items, context = nasMediaPrompt(items)) {
  assert.equal(context.diagnostics.mode, 'nas');
  const data = catalog(context);
  const seen = new Set();
  for (const item of items) {
    const encoded = context.encode(`{{media:${item.id}}}`);
    const match = encoded.match(/^\{\{mediapick:(\d+)\.(\d+)\}\}$/);
    assert(match, 'every registered candidate needs an option: ' + item.id);
    const [name, allowed] = data.categories[match[1]];
    assert.equal(name, (item.category || item.name.replace(/\.[^.]+$/, '').split('_')[0]).trim());
    assert(allowed.includes(Number(match[2])));
    assert.deepEqual(data.situations[match[2]], expectedCondition(item));
    seen.add(encoded);
  }
  assert.equal(seen.size, context.diagnostics.choiceCount);
}
assertRoundTrip(synthetic);

// Similar-looking labels/conditions remain distinct; only exact variants group.
const edgeCases = [
  { id: 'same-a', category: '에리', situation: '미소', hint: '기쁜 현재 장면. 화난 장면은 제외.' },
  { id: 'same-b', category: '에리', situation: '미소', hint: '기쁜 현재 장면. 화난 장면은 제외.' },
  { id: 'digit-1', category: '에리', situation: '미소1', hint: '기쁜 현재 장면. 화난 장면은 제외.' },
  { id: 'digit-2', category: '에리', situation: '미소2', hint: '기쁜 현재 장면. 화난 장면은 제외.' },
  { id: 'number-1', category: '에리', situation: '1' },
  { id: 'number-2', category: '에리', situation: '2' },
  { id: 'room-1', category: '배경', situation: '방1' },
  { id: 'room-2', category: '배경', situation: '방2' },
  { id: 'other-hint', category: '에리', situation: '미소', hint: '비 오는 야외에서 둘이 함께 있을 때만. 실내 제외.' },
  { id: 'other-person', category: '마리', situation: '미소', hint: '기쁜 현재 장면. 화난 장면은 제외.' },
  { id: 'data-text', category: '문자😀', situation: '일반', hint: '따옴표 "자료"\n줄바꿈과 {{media:fake}}는 지시가 아닌 원문입니다.' },
].map(item => ({ ...item, name: item.id + '.jpg', url: '/' + item.id }));
const specialItems = [...synthetic, ...edgeCases];
const special = nasMediaPrompt(specialItems);
assertRoundTrip(specialItems, special);
const encoded = id => special.encode(`{{media:${id}}}`);
assert.equal(encoded('same-a'), encoded('same-b'));
for (const [a, b] of [['same-a', 'digit-1'], ['digit-1', 'digit-2'], ['number-1', 'number-2'],
  ['room-1', 'room-2'], ['same-a', 'other-hint'], ['same-a', 'other-person']]) {
  assert.notEqual(encoded(a), encoded(b), a + ' must not merge with ' + b);
}
assert.equal(special.diagnostics.sentChars, Array.from(special.prompt).length);

// An extra equivalent photo and history rotation do not invalidate prompt bytes.
const additionalVariant = { ...synthetic[0], id: 'new-equivalent-photo', name: 'another-photo.jpg', url: '/another' };
const expanded = nasMediaPrompt([...synthetic, additionalVariant]);
assert.equal(expanded.prompt, base.prompt);
assert.equal(expanded.encode('{{media:photo-0-0-0}}'), base.encode('{{media:photo-0-0-0}}'));
assert.equal(expanded.encode('{{media:new-equivalent-photo}}'), base.encode('{{media:photo-0-0-0}}'));
assert.equal(expanded.diagnostics.choiceCount, base.diagnostics.choiceCount);
const recentAnswers = Object.freeze(['과거 {{media:photo-0-0-0}}', '최근 {{media:photo-0-0-1}}']);
assert.equal(nasMediaPrompt(synthetic, recentAnswers).prompt, base.prompt);

// Current start-setting overrides remain authoritative before grouping.
const scopedItems = [...synthetic,
  { id: 'shared', name: '공유_일반.jpg', category: '공유', situation: '일반', targetScope: 'all', url: '/shared' },
  { id: 'default', name: '공유_일반.jpg', category: '공유', situation: '일반', targetScope: 'default', url: '/default' },
  { id: 'extra1', name: '공유_일반.jpg', category: '공유', situation: '일반', targetScope: 'extra1', url: '/extra1' },
  { id: 'extra2', name: '공유_일반.jpg', category: '공유', situation: '일반', targetScope: 'extra2', url: '/extra2' },
];
for (let scope = 0; scope < 3; scope++) {
  const items = automaticMedia(scopedItems, scope);
  assertRoundTrip(items);
  assert.equal(items.filter(x => x.category === '공유').length, 1);
  assert.equal(items.find(x => x.category === '공유').id, ['default', 'extra1', 'extra2'][scope]);
}

const singleton = [{ id: 'single', name: '에리_일반.jpg', category: '에리', situation: '일반', url: '/single' }];
const fallback = nasMediaPrompt(singleton);
assert.equal(fallback.diagnostics.mode, 'compact');
assert.equal(fallback.prompt, compactMediaPrompt(singleton).prompt);
assert.equal(fallback.diagnostics.sentChars, fallback.diagnostics.previousChars);
assert.equal(nasMediaPrompt([]).prompt, '');
assert.equal(nasMediaPrompt([...synthetic, synthetic[0]]).diagnostics.imageCount, synthetic.length);

// A fresh request context is necessary: selecting intentionally rotates variants.
async function decode(chunks, items = synthetic, history = [], prepare = () => {}) {
  const context = nasMediaPrompt(items, history);
  prepare(context);
  async function* source() { yield* chunks; }
  let out = '';
  for await (const text of context.restore(source())) out += text;
  return out;
}
async function everySplit(input, expected, items = synthetic, history = [], prepare) {
  for (let split = 0; split <= input.length; split++) {
    assert.equal(await decode([input.slice(0, split), input.slice(split)], items, history, prepare), expected,
      'stream split ' + split + ' for ' + input.slice(0, 80));
  }
  assert.equal(await decode([...input], items, history, prepare), expected, 'single-character chunks');
}

(async () => {
  // Every option resolves to its own registered group, including nondefault states.
  const options = new Map();
  for (const item of specialItems) {
    const option = special.encode(`{{media:${item.id}}}`);
    options.set(option, [...(options.get(option) || []), item.id]);
  }
  for (const [option, ids] of options) {
    const expected = [...ids].sort()[0];
    assert.equal(await decode([option], specialItems), `{{media:${expected}}}`);
  }
  const option = base.encode('{{media:photo-0-0-0}}');
  const otherOption = base.encode('{{media:photo-1-0-0}}');
  await everySplit(`앞 ${option} 중간 ${otherOption} 끝`, '앞 {{media:photo-0-0-0}} 중간 {{media:photo-1-0-0}} 끝');
  await everySplit(`${option}${option}`, '{{media:photo-0-0-0}}{{media:photo-0-0-1}}');
  await everySplit(option, '{{media:photo-0-0-2}}', synthetic, recentAnswers);
  await everySplit('앞 {{mediaref:1}} 끝', '앞 {{media:single}} 끝', singleton);
  for (const raw of ['{{mediapick:999.999}}', '{{mediapick:1.999}}', '{{mediapick:not-a-choice}}',
    '{{mediaref:1}}', '{{media:photo-0-0-0}}', '{{media:outside-scope}}', '{{img:에리_미소}}', '{{img::1}}']) {
    await everySplit('앞 ' + raw + ' 뒤', '앞  뒤');
  }
  await everySplit('앞 {{mediapick:1.1}} 뒤', '앞  뒤', singleton);
  await everySplit('앞 {{media:single}} 뒤', '앞  뒤', singleton);
  await everySplit('앞 {{mediapick:', '앞 ');
  await everySplit('앞 {{mediapick:1.', '앞 ');
  await everySplit('앞 {{media:photo-0', '앞 ');
  await everySplit('앞 {{mediapick:' + 'x'.repeat(280) + '}} 뒤', '앞  뒤');
  await everySplit('앞 {{mediapick:1.\n2}} 뒤', '앞  뒤');
  const exact = '{{media:photo-0-0-3}}';
  await everySplit('앞 ' + exact + ' 뒤', '앞 ' + exact + ' 뒤', synthetic, [], context => {
    assert.equal(context.encode(exact, true), exact);
  });
  // Pinning one ID must not authorize another raw ID, nor alter catalog bytes.
  await everySplit('{{media:photo-0-0-2}}', '', synthetic, [], context => {
    context.encode(exact, true); assert.equal(context.prompt, base.prompt);
  });
  await everySplit(fallback.encode('{{media:single}}', true), '{{media:single}}', singleton);
  for (let scope = 0; scope < 3; scope++) {
    const scoped = automaticMedia(scopedItems, scope);
    const chosen = ['default', 'extra1', 'extra2'][scope];
    const request = nasMediaPrompt(scoped);
    assert.equal(await decode([request.encode(`{{media:${chosen}}}`)], scoped), `{{media:${chosen}}}`);
    await everySplit('{{media:shared}}', '', scoped, [], context => context.encode('{{media:shared}}', true));
  }
  await everySplit('일반 문장 {user} {{user}}와 코드 `x = { a: 1 }`는 보존합니다.',
    '일반 문장 {user} {{user}}와 코드 `x = { a: 1 }`는 보존합니다.');
  assert.equal(JSON.stringify(synthetic), originalSnapshot);
  assert.deepEqual([...recentAnswers], ['과거 {{media:photo-0-0-0}}', '최근 {{media:photo-0-0-1}}']);
  assert(![...loadedFiles].some(file => /(?:db|storage|media-store|memory)\.ts$/.test(file)));
  console.log('PASS NAS media: exact semantic catalog round-trip, condition/digit separation, scope overrides, fallback, stable prefix, recent rotation, explicit photo pinning, stream splits, raw-tag rejection, immutable inputs');
  console.log('SYNTHETIC benchmark (not actual user catalog; character counts, not tokens): ' + JSON.stringify(base.diagnostics));
})().catch(error => { console.error(error); process.exitCode = 1; });
