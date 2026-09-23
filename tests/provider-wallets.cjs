// Offline tests for per-provider star wallets: isolated SQLite only, no network or paid calls.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript'), Database = require('better-sqlite3');
const db = new Database(':memory:');
db.exec(`CREATE TABLE characters(id TEXT PRIMARY KEY,name TEXT); CREATE TABLE chat_sessions(id TEXT PRIMARY KEY,character_id TEXT);
INSERT INTO characters VALUES('c','테스트'); INSERT INTO chat_sessions VALUES('s','c');
-- Ledger exactly as it existed before this update (no provider column).
CREATE TABLE star_account (id INTEGER PRIMARY KEY CHECK(id=1), started_at TEXT NOT NULL);
CREATE TABLE star_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, request_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, kind TEXT NOT NULL, title TEXT NOT NULL, amount_nano INTEGER,
  model TEXT, tokens TEXT, completed INTEGER NOT NULL DEFAULT 1, pricing TEXT);
INSERT INTO star_account VALUES (1, CURRENT_TIMESTAMP);
INSERT INTO star_ledger(request_key,kind,title,amount_nano) VALUES ('old-start','시작 잔액','시작 잔액 등록',20000000000);
INSERT INTO star_ledger(request_key,kind,title,amount_nano) VALUES ('old-topup','충전 등록','충전액 등록',30000000000);
INSERT INTO star_ledger(request_key,kind,title,amount_nano,model,pricing) VALUES ('old-claude','채팅','테스트',-1000000000,'claude-opus-4-6','{"rates":[5,25,10,0.5]}');
INSERT INTO star_ledger(request_key,kind,title,amount_nano,model,pricing) VALUES ('old-gpt','요약','테스트',-200000000,'gpt-5.4-mini','{"provider":"openai"}');
INSERT INTO star_ledger(request_key,kind,title,amount_nano,model,pricing,completed) VALUES ('old-gemini','채팅','테스트',NULL,'gemini-3.8-flash','not json',0);
INSERT INTO star_ledger(request_key,kind,title,amount_nano,model) VALUES ('old-o3','기타 생성','테스트',-50000000,'o3');`);
const root = path.resolve(__dirname, '..'), cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const req = name => name === '@/lib/db' ? db : name === 'next/server' ? { NextResponse: Response } : name.startsWith('@/') ? load(name.slice(2) + '.ts') : require(name);
  vm.runInNewContext(js, { exports, require: req, URL, Response, Request, console }, { filename: file });
  return exports;
}
const wallet = load('lib/stars.ts'), api = load('app/api/stars/route.ts');
const request = (body, method) => new Request('http://localhost/api/stars', { method, headers: { 'Content-Type': 'application/json', 'sec-fetch-site': 'same-origin' }, body: JSON.stringify(body) });
const provider = key => db.prepare('SELECT provider FROM star_ledger WHERE request_key=?').get(key).provider;
(async () => {
  // Migration: deposits -> Claude, usage -> stored provider or model prefix.
  const totalBefore = db.prepare('SELECT SUM(amount_nano) AS b FROM star_ledger').get().b;
  let w = wallet.providerWallets();
  assert.equal(provider('old-start'), 'anthropic'); assert.equal(provider('old-topup'), 'anthropic');
  assert.equal(provider('old-claude'), 'anthropic'); assert.equal(provider('old-gpt'), 'openai');
  assert.equal(provider('old-gemini'), 'gemini'); assert.equal(provider('old-o3'), 'openai');
  assert.equal(w.anthropic.charged, 50e9); assert.equal(w.anthropic.used, 1e9); assert.equal(w.anthropic.balance, 49e9);
  assert.equal(w.openai.charged, 0); assert.equal(w.openai.used, 250e6); assert.equal(w.openai.balance, -250e6);
  assert.equal(w.gemini.pending, 1); assert.equal(w.gemini.partial, 1); assert.equal(w.gemini.balance, 0);
  assert.equal(w.deepseek.balance, 0);
  // The total balance is unchanged by the split and equals the sum of the wallets.
  assert.equal(wallet.starBalance().balance, totalBefore);
  assert.equal(Object.values(w).reduce((s, x) => s + x.balance, 0), totalBefore);
  wallet.initStars(); wallet.initStars(); // idempotent
  assert.equal(provider('old-topup'), 'anthropic');

  // New usage rows record the provider.
  wallet.chargeUsage('new-deepseek', 'deepseek-flash', { input: 1000, output: 1000, write: 0, read: 0 }, true, { tracking: true, kind: '채팅', sessionId: 's', provider: 'deepseek', requestedAt: '2026-09-20T02:00:00Z' });
  wallet.chargeUsage('new-claude', 'claude-sonnet-4-6', { input: 1000, output: 0, write: 0, read: 0 }, true, { tracking: true, kind: '요약', sessionId: 's' });
  assert.equal(provider('new-deepseek'), 'deepseek'); assert.equal(provider('new-claude'), 'anthropic');

  // Deposits go to the chosen wallet; retries are idempotent; provider is part of the request identity.
  let res = await api.POST(request({ amount: '12.5', initial: false, provider: 'openai', key: 'gpt-topup-1234567890' }, 'POST'));
  assert.equal(res.status, 200, await res.clone().text());
  await api.POST(request({ amount: '12.5', initial: false, provider: 'openai', key: 'gpt-topup-1234567890' }, 'POST'));
  assert.equal(wallet.providerWallets().openai.charged, 12.5e9);
  assert.equal((await api.POST(request({ amount: '12.5', initial: false, provider: 'gemini', key: 'gpt-topup-1234567890' }, 'POST'))).status, 400);
  assert.equal((await api.POST(request({ amount: '1', initial: false, provider: 'mistral', key: 'bad-provider-1234567' }, 'POST'))).status, 400);
  wallet.depositStars({ amount: '1', initial: false, key: 'legacy-client-12345678' }); // old client: Claude
  assert.equal(provider('legacy-client-12345678'), 'anthropic');

  // Scoped listing: rows, costs and running balance follow the selected wallet.
  const all = wallet.listStars('전체내역', '전체', 0, 'all');
  const gpt = wallet.listStars('전체내역', '전체', 0, 'all', 'openai');
  assert.equal(all.scope, 'all'); assert.equal(gpt.scope, 'openai');
  assert(gpt.rows.length && gpt.rows.every(r => r.provider === 'openai'));
  assert.equal(gpt.rows[0].balance, gpt.selected.balance);
  assert.equal(gpt.selected.balance, 12.5e9 - 250e6);
  assert.equal(all.selected.balance, all.balance);
  assert.equal(all.balance, Object.values(all.providers).reduce((s, x) => s + x.balance, 0));
  assert.equal(wallet.listStars('구매내역', '전체', 0, 'all', 'openai').rows.length, 1);
  assert.equal(wallet.listStars('이용내역', '전체', 0, 'all', 'deepseek').rows.length, 1);
  const costs = ['anthropic', 'openai', 'gemini', 'deepseek'].map(p => wallet.starCostSummary('all', p));
  assert.equal(costs.reduce((s, c) => s + c.cost, 0), wallet.starCostSummary('all').cost);
  assert.equal(wallet.starCostSummary('all', 'openai').summary.cost, 200e6);
  assert.equal((await api.GET(new Request('http://localhost/api/stars?provider=evil'))).status, 400);
  assert.equal((await (await api.GET(new Request('http://localhost/api/stars?provider=gemini&period=all'))).json()).scope, 'gemini');

  // Moving a deposit changes wallets but never the total, amount, or usage.
  const topup = db.prepare("SELECT id,amount_nano FROM star_ledger WHERE request_key='old-topup'").get();
  const totalMid = wallet.starBalance().balance, costMid = wallet.starCostSummary('all').cost;
  const move = { action: 'provider', id: topup.id, provider: 'gemini', expectedProvider: 'anthropic', key: 'move-topup-1234567890' };
  res = await api.PATCH(request(move, 'PATCH')); assert.equal(res.status, 200, await res.clone().text());
  res = await api.PATCH(request(move, 'PATCH')); assert.equal(res.status, 200); // same retry
  w = wallet.providerWallets();
  assert.equal(w.gemini.charged, 30e9); assert.equal(w.anthropic.charged, 21e9);
  assert.equal(wallet.starBalance().balance, totalMid); assert.equal(wallet.starCostSummary('all').cost, costMid);
  assert.equal(db.prepare('SELECT amount_nano FROM star_ledger WHERE id=?').get(topup.id).amount_nano, topup.amount_nano);
  assert.equal(wallet.listStars('구매내역', '전체', 0, 'all', 'gemini').rows[0].provider_edit_count, 1);
  // Stale view, usage rows, reused key and bad input are rejected.
  assert.throws(() => wallet.moveStarDeposit({ ...move, key: 'stale-move-1234567890', provider: 'openai' }), /다른 화면/);
  const usage = db.prepare("SELECT id FROM star_ledger WHERE request_key='old-claude'").get();
  assert.throws(() => wallet.moveStarDeposit({ ...move, id: usage.id, key: 'usage-move-1234567890' }));
  assert.throws(() => wallet.moveStarDeposit({ ...move, provider: 'openai' }), /이미 사용한/);
  assert.throws(() => wallet.moveStarDeposit({ ...move, key: 'bad-provider-move-123', provider: 'x' }));
  assert.equal(provider('old-claude'), 'anthropic');
  // Amount corrections still work after a move and stay in the moved wallet.
  wallet.editStarDeposit({ id: topup.id, amount: '10', expectedAmount: topup.amount_nano, key: 'fix-moved-1234567890' });
  assert.equal(wallet.providerWallets().gemini.charged, 10e9);
  // Gemini is billed in won: won amount + won-per-dollar rate -> stars, won amount kept on the row.
  assert.equal(wallet.latestKrwRate('gemini'), null);
  const gemBefore = wallet.providerWallets().gemini.charged, totalK = wallet.starBalance().balance;
  res = await api.POST(request({ currency: 'KRW', krw: '50000', krwPerUsd: '1390.5', initial: false, provider: 'gemini', key: 'gemini-krw-1234567890' }, 'POST'));
  assert.equal(res.status, 200, await res.clone().text());
  await api.POST(request({ currency: 'KRW', krw: '50000', krwPerUsd: '1390.5', initial: false, provider: 'gemini', key: 'gemini-krw-1234567890' }, 'POST')); // retry
  const krwNano = Math.round(50000 / 1390.5 * 1e9); // $35.958288...
  assert.equal(wallet.providerWallets().gemini.charged - gemBefore, krwNano);
  assert.equal(wallet.starBalance().balance - totalK, krwNano);
  const krwRow = db.prepare("SELECT id,amount_nano,pricing FROM star_ledger WHERE request_key='gemini-krw-1234567890'").get();
  assert.deepEqual(JSON.parse(krwRow.pricing), { currency: 'KRW', krw: 50000, krwPerUsd: 1390.5 });
  assert.equal(wallet.latestKrwRate('gemini'), 1390.5);
  assert.equal(wallet.listStars('구매내역', '전체', 0, 'all', 'gemini').geminiKrwRate, 1390.5);
  // Same key with a different rate is a different request.
  assert.equal((await api.POST(request({ currency: 'KRW', krw: '50000', krwPerUsd: '1400', initial: false, provider: 'gemini', key: 'gemini-krw-1234567890' }, 'POST'))).status, 400);
  for (const bad of [{ krw: '0' }, { krw: '-1' }, { krw: '1.5' }, { krw: '20000001' }, { krwPerUsd: '12' }, { krwPerUsd: '1390.555' }, { krwPerUsd: '9999' }, { currency: 'EUR' }])
    assert.throws(() => wallet.depositStars({ currency: 'KRW', krw: '1000', krwPerUsd: '1390', initial: false, provider: 'gemini', key: 'bad-krw-12345678901', ...bad }));
  // Won deposits are corrected in won; usage rows keep their USD pricing.
  wallet.editStarDeposit({ id: krwRow.id, currency: 'KRW', krw: '60000', krwPerUsd: '1390.5', expectedAmount: krwRow.amount_nano, key: 'fix-krw-1234567890' });
  const fixed = db.prepare('SELECT amount_nano,pricing FROM star_ledger WHERE id=?').get(krwRow.id);
  assert.equal(fixed.amount_nano, Math.round(60000 / 1390.5 * 1e9)); assert.equal(JSON.parse(fixed.pricing).krw, 60000);
  // A USD correction of a won row clears the won record.
  wallet.editStarDeposit({ id: krwRow.id, amount: '40', expectedAmount: fixed.amount_nano, key: 'fix-krw-usd-12345678' });
  assert.equal(db.prepare('SELECT pricing FROM star_ledger WHERE id=?').get(krwRow.id).pricing, null);
  // Reconcile: set a wallet to the real balance with one adjustment row; nothing else changes.
  let cw = wallet.providerWallets().anthropic;
  const usageRowsBefore = db.prepare("SELECT COUNT(*) AS n FROM star_ledger WHERE kind NOT IN ('시작 잔액','충전 등록','잔액 조정')").get().n;
  const costBeforeR = wallet.starCostSummary('all').cost, otherBefore = wallet.providerWallets().openai.balance;
  const fix = { action: 'reconcile', provider: 'anthropic', amount: '38.19', expectedBalance: cw.balance, key: 'reconcile-claude-12345' };
  res = await api.POST(request(fix, 'POST')); assert.equal(res.status, 200, await res.clone().text());
  assert.equal((await res.json()).adjusted, 38.19e9 - cw.balance);
  res = await api.POST(request(fix, 'POST')); assert.equal(res.status, 200); // retry: no second row
  cw = wallet.providerWallets().anthropic;
  assert.equal(cw.balance, 38.19e9); assert.equal(cw.charged + cw.adjusted - cw.used, cw.balance);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM star_ledger WHERE kind='잔액 조정'").get().n, 1);
  assert.equal(wallet.starCostSummary('all').cost, costBeforeR); // not a usage cost
  assert.equal(wallet.providerWallets().openai.balance, otherBefore);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM star_ledger WHERE kind NOT IN ('시작 잔액','충전 등록','잔액 조정')").get().n, usageRowsBefore);
  assert.equal(wallet.listStars('구매내역', '잔액 조정', 0, 'all', 'anthropic').rows.length, 1);
  assert(wallet.listStars('이용내역', '전체', 0, 'all', 'anthropic').rows.every(r => r.kind !== '잔액 조정'));
  const adj = wallet.listStars('구매내역', '잔액 조정', 0, 'all', 'anthropic').rows[0];
  assert.equal(adj.balance, 38.19e9); assert.equal(JSON.parse(adj.pricing).target, 38.19e9);
  // Stale balance (usage landed meanwhile), same key reuse, bad provider, and no-op.
  wallet.chargeUsage('late-claude', 'claude-sonnet-4-6', { input: 1000, output: 0, write: 0, read: 0 }, true, { tracking: true, kind: '채팅', sessionId: 's' });
  assert.throws(() => wallet.reconcileStars({ ...fix, key: 'reconcile-stale-12345' }), /잔액이 바뀌었습니다/);
  assert.throws(() => wallet.reconcileStars({ ...fix, amount: '40' }), /이미 사용한/);
  assert.throws(() => wallet.reconcileStars({ ...fix, provider: 'x', key: 'reconcile-bad-1234567' }));
  const now = wallet.providerWallets().anthropic.balance;
  assert.equal(wallet.reconcileStars({ ...fix, amount: (now / 1e9).toFixed(2), expectedBalance: now, key: 'reconcile-noop-123456' }).adjusted, Math.round(now / 1e7) * 1e7 - now);
  // Gemini reconciles in won; the rate becomes the latest won rate.
  const gw = wallet.providerWallets().gemini;
  wallet.reconcileStars({ action: 'reconcile', provider: 'gemini', currency: 'KRW', krw: '30000', krwPerUsd: '1400', expectedBalance: gw.balance, key: 'reconcile-gemini-12345' });
  assert.equal(wallet.providerWallets().gemini.balance, Math.round(30000 / 1400 * 1e9));
  assert.equal(wallet.latestKrwRate('gemini'), 1400);
  assert.equal(wallet.starBalance().balance, Object.values(wallet.providerWallets()).reduce((s, x) => s + x.balance, 0));
  console.log('PASS legacy ledger split (deposits->Claude, usage by provider/model), wallet sums equal total, provider deposits/retries/validation, scoped rows/costs/running balance, deposit moves keep totals and usage, API validation, Gemini won deposits/rates/corrections, balance reconcile');
})().catch(error => { console.error(error); process.exit(1); });
