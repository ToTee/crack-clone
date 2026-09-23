import type { AiProvider } from '@/lib/ai-config';
import type { KeywordSelection } from '@/lib/keyword-book';
import type { memoryContext } from '@/lib/memory';
import type { MediaInputDetails } from '@/lib/nas-media';
import db from '@/lib/db';

// Integer nanodollars: $1 = 1e9 units = 1,000 stars. No per-call rounding to whole stars.
export function initStars() {
  db.exec(`CREATE TABLE IF NOT EXISTS star_account (id INTEGER PRIMARY KEY CHECK(id=1), started_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS star_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT, request_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, kind TEXT NOT NULL,
      title TEXT NOT NULL, amount_nano INTEGER, model TEXT, tokens TEXT,
      completed INTEGER NOT NULL DEFAULT 1, pricing TEXT);
    CREATE INDEX IF NOT EXISTS star_ledger_kind ON star_ledger(kind,id);
    CREATE TABLE IF NOT EXISTS star_deposit_edits (id INTEGER PRIMARY KEY AUTOINCREMENT, request_key TEXT NOT NULL UNIQUE, ledger_id INTEGER NOT NULL, old_amount INTEGER NOT NULL, new_amount INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS star_provider_edits (id INTEGER PRIMARY KEY AUTOINCREMENT, request_key TEXT NOT NULL UNIQUE, ledger_id INTEGER NOT NULL, old_provider TEXT, new_provider TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  if (providerColumnReady) return;
  const columns = db.prepare('PRAGMA table_info(star_ledger)').all() as Array<{ name: string }>;
  if (!columns.some(column => column.name === 'provider')) {
    // One-time split of the shared wallet. Usage rows keep the provider recorded at
    // request time (or implied by the model ID). Existing deposits start as Claude;
    // the user can move each one to another provider from the history screen.
    db.transaction(() => {
      db.exec('ALTER TABLE star_ledger ADD COLUMN provider TEXT');
      db.exec(`UPDATE star_ledger SET provider = CASE
        WHEN kind IN ('시작 잔액','충전 등록') THEN 'anthropic'
        WHEN json_valid(pricing) AND json_extract(pricing,'$.provider') IN ('anthropic','openai','gemini','deepseek') THEN json_extract(pricing,'$.provider')
        ${PROVIDER_CASE}
        ELSE 'anthropic' END`);
    })();
  }
  db.exec('CREATE INDEX IF NOT EXISTS star_ledger_provider ON star_ledger(provider,id)');
  providerColumnReady = true;
}
let providerColumnReady = false;
export const STAR_PROVIDERS = ['anthropic', 'openai', 'gemini', 'deepseek'] as const satisfies readonly AiProvider[];
export type StarScope = AiProvider | 'all';
export const isStarProvider = (value: unknown): value is AiProvider => STAR_PROVIDERS.includes(value as AiProvider);
// Same prefixes as ai-config.validModelId; used only when a row has no stored provider.
const PROVIDER_CASE = `WHEN model LIKE 'claude-%' THEN 'anthropic'
        WHEN model LIKE 'gemini-%' THEN 'gemini'
        WHEN model LIKE 'deepseek-%' THEN 'deepseek'
        WHEN model LIKE 'gpt-%' OR model LIKE 'chat-latest%' OR model GLOB 'o[1-9]*' THEN 'openai'`;
export function providerOfModel(model: string): AiProvider | null {
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gemini-')) return 'gemini';
  if (model.startsWith('deepseek-')) return 'deepseek';
  if (/^(?:gpt-|chat-latest|o[1-9])/.test(model)) return 'openai';
  return null;
}
export function starsActive() {
  initStars();
  return Boolean(db.prepare('SELECT id FROM star_account WHERE id=1').get());
}
// Lightweight balance read for the chat UI; no history pagination or AI calls.
export function starBalance() {
  initStars();
  const total = db.prepare('SELECT COALESCE(SUM(amount_nano),0) AS balance, SUM(CASE WHEN amount_nano IS NULL THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN completed=0 THEN 1 ELSE 0 END) AS partial FROM star_ledger').get() as { balance: number; pending: number; partial: number };
  return { active: starsActive(), balance: total.balance, pending: total.pending || 0, partial: total.partial || 0, providers: providerWallets() };
}
type Wallet = { charged: number; adjusted: number; used: number; balance: number; pending: number; partial: number };
const emptyWallet = (): Wallet => ({ charged: 0, adjusted: 0, used: 0, balance: 0, pending: 0, partial: 0 });
// Per-provider totals: charged = registered deposits, adjusted = balance corrections,
// used = calculated usage, balance = charged + adjusted - used.
export function providerWallets(): Record<AiProvider, Wallet> {
  initStars();
  const rows = db.prepare(`SELECT provider,
    COALESCE(SUM(CASE WHEN kind IN ('시작 잔액','충전 등록') THEN amount_nano ELSE 0 END),0) AS charged,
    COALESCE(SUM(CASE WHEN kind='잔액 조정' THEN amount_nano ELSE 0 END),0) AS adjusted,
    COALESCE(SUM(CASE WHEN kind NOT IN ('시작 잔액','충전 등록','잔액 조정') THEN -amount_nano ELSE 0 END),0) AS used,
    COALESCE(SUM(amount_nano),0) AS balance,
    SUM(CASE WHEN amount_nano IS NULL THEN 1 ELSE 0 END) AS pending,
    SUM(CASE WHEN completed=0 THEN 1 ELSE 0 END) AS partial
    FROM star_ledger WHERE provider IS NOT NULL GROUP BY provider`).all() as Array<Wallet & { provider: string }>;
  const result = Object.fromEntries(STAR_PROVIDERS.map(p => [p, emptyWallet()])) as Record<AiProvider, Wallet>;
  for (const row of rows) if (isStarProvider(row.provider)) result[row.provider] = { charged: row.charged, adjusted: row.adjusted, used: row.used, balance: row.balance, pending: row.pending || 0, partial: row.partial || 0 };
  return result;
}
// Standard direct Anthropic API, 5-minute or 1-hour cache writes. Verified 2026-09-19:
// https://platform.claude.com/docs/en/about-claude/pricing
export function priceFor(model: string, cacheTtl: '5m' | '1h' = '5m', inputTokens = 0, requestedAt?: string): number[] | null {
  if (/^claude-opus-(?:4-5|4-6|4-7|4-8|5)(?:-\d{8})?$/.test(model)) return [5, 25, cacheTtl === '1h' ? 10 : 6.25, .5];
  if (/^claude-sonnet-(?:4-5|4-6)(?:-\d{8})?$/.test(model)) return [3, 15, cacheTtl === '1h' ? 6 : 3.75, .3];
  if (/^claude-haiku-4-5(?:-\d{8})?$/.test(model)) return [1, 5, cacheTtl === '1h' ? 2 : 1.25, .1];
  if (/^claude-sonnet-5(?:-\d{8})?$/.test(model)) return [2, 10, cacheTtl === '1h' ? 4 : 2.5, .2];
  if (/^claude-(?:fable|mythos)-5(?:-1)?(?:-\d{8})?$/.test(model)) return [10, 50, cacheTtl === '1h' ? 20 : 12.5, /-5-1(?:-|$)/.test(model) ? .25 : 1];
  if (/^gpt-4\.1(?:-2025-04-14)?$/.test(model)) return [2, 8, 0, .5];
  if (/^gpt-4\.1-mini(?:-2025-04-14)?$/.test(model)) return [.4, 1.6, 0, .1];
  const legacy = ({
    'gpt-5-nano': [.05, .4, 0, .005], 'gpt-4.1-nano': [.1, .4, 0, .025],
    'gpt-4o-mini': [.15, .6, 0, .075], 'gpt-5.4-nano': [.2, 1.25, 0, .02],
    'gpt-5-mini': [.25, 2, 0, .025], 'gpt-5.4-mini': [.75, 4.5, 0, .075],
    'o3-mini': [1.1, 4.4, 0, .55], 'o4-mini': [1.1, 4.4, 0, .275],
    'gpt-5': [1.25, 10, 0, .125], 'gpt-5.1': [1.25, 10, 0, .125],
    'gpt-5.2': [1.75, 14, 0, .175], 'o3': [2, 8, 0, .5],
    'gpt-4o': [2.5, 10, 0, 1.25], 'gpt-5.5': [5, 30, 0, .5],
    'gpt-5-pro': [15, 120, 0, 0], 'gpt-5.4-pro': [30, 180, 0, 0], 'gpt-5.5-pro': [30, 180, 0, 0], 'o3-pro': [20, 80, 0, 0], 'o1-pro': [150, 600, 0, 0],
    'gpt-5.2-pro': [21, 168, 0, 0], 'o1': [15, 60, 0, 7.5],
  } as Record<string, number[]>)[model];
  if (model === 'gpt-5.5-pro' && inputTokens > 272000) return null;
  if (legacy) return ['gpt-5.5','gpt-5.4-pro'].includes(model) && inputTokens > 272000 ? legacy.map((rate,i) => rate * (i === 1 ? 1.5 : 2)) : legacy;
  const gpt = ({ 'gpt-5.6-luna': [.2, 1.2, .25, .02], 'gpt-5.6-terra': [2, 12, 2.5, .2], 'gpt-5.6-sol': [4, 20, 5, .4], 'gpt-5.6': [4, 20, 5, .4], 'gpt-6-astra': [10, 50, 12.5, 1] } as Record<string, number[]>)[model];
  if (gpt) return inputTokens > 272000 ? gpt.map((rate, i) => rate * (i === 1 ? 1.5 : 2)) : gpt;
  if (model === 'gpt-5.4') return inputTokens > 272000 ? [5, 22.5, 0, .5] : [2.5, 15, 0, .25];
  if (/^deepseek-(?:flash|v4-flash|v4-flash-vision-exp|v4-pro)$/.test(model)) {
    const at = requestedAt ? new Date(requestedAt) : new Date();
    if (!Number.isFinite(at.getTime())) return null;
    const hour = at.getUTCHours(), weekday = at.getUTCDay();
    const peak = weekday > 0 && weekday < 6 && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
    const rates = model === 'deepseek-v4-pro' ? [.66, 1.98, 0, .022] : [.15, .6, 0, .003];
    return peak ? rates.map(rate => rate * 2) : rates;
  }
  if (model === 'gemini-3.1-flash-lite') return [.25, 1.5, 0, .025];
  if (model === 'gemini-3.5-flash-lite') return [.3, 2.5, 0, .03];
  if (model === 'gemini-3-flash-preview') return [.5, 3, 0, .05];
  if (model === 'gemini-3.5-flash') return [1.5, 9, 0, .15];
  if (/^gemini-3\.[678]-flash$/.test(model)) return (requestedAt ? Date.parse(requestedAt) : Date.now()) < Date.parse('2027-01-01T00:00:00Z') ? [.75, 3.75, 0, .075] : [1.5, 7.5, 0, .15];
  if (/^gemini-3\.1-pro-preview(?:-customtools)?$/.test(model)) return inputTokens > 200000 ? [4, 18, 0, .4] : [2, 12, 0, .2];
  return null;
}
export type Usage = { input: number; output: number; write: number; read: number };
export type InputBreakdown = {
  media?: MediaInputDetails;
  memoryCachedChars?: number; cachedChars: number; keywordChars: number; memoryChars: number; memoryCount: number;
  keywords: KeywordSelection[];
  keywordExcludeStatus?: boolean;
  memory?: ReturnType<typeof memoryContext>['diagnostics'];
  historyChars?: number; historyMessages?: number; historyTurns?: number;
  requestChars?: number; otherChars?: number; totalChars?: number;
};
export type UsageContext = { memoryFormat?: 'records'; kind?: string; sessionId?: string; tracking?: boolean; inputBreakdown?: InputBreakdown; cacheTtl?: '5m' | '1h'; provider?: AiProvider; usageMissing?: boolean; requestedAt?: string };
export function chargeUsage(key: string, model: string, usage: Usage, completed: boolean, context: UsageContext) {
  if (!context.tracking) return;
  initStars();
  const rates = priceFor(model, context.cacheTtl, usage.input + usage.read + usage.write, context.requestedAt);
  const values = [usage.input, usage.output, usage.write, usage.read];
  const valid = !context.usageMissing && values.every((n, i) => Number.isSafeInteger(n) && n >= 0 && (!rates || n === 0 || rates[i] > 0));
  const cost = rates && valid ? values.reduce((sum, n, i) => sum + n * Math.round(rates[i] * 1000), 0) : null;
  const amount = cost !== null && Number.isSafeInteger(cost) ? -cost : null;
  const character = context.sessionId ? db.prepare('SELECT c.name FROM chat_sessions s JOIN characters c ON c.id=s.character_id WHERE s.id=?').get(context.sessionId) as { name: string } | undefined : undefined;
  const provider = context.provider || providerOfModel(model) || 'anthropic';
  db.prepare('INSERT OR IGNORE INTO star_ledger(request_key,kind,title,amount_nano,model,tokens,completed,pricing,provider) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(key, context.kind || '기타 생성', character?.name || 'AI 생성', amount, model, JSON.stringify(usage), completed ? 1 : 0, JSON.stringify({ rates, date: '2026-09-21', provider, usageMissing: context.usageMissing || false, note: model.startsWith('deepseek-') ? '요청 시작 시각(UTC)의 혼잡/비혼잡 단가 추정입니다. 중국 공휴일 할인과 시간 경계를 넘긴 요청은 실제 청구액과 다를 수 있습니다.' : null, cacheMinutes: model.startsWith('claude-') ? (context.cacheTtl === '1h' ? 60 : 5) : null, inputBreakdown: context.inputBreakdown }), provider);
}
type DepositInput = { amount?: unknown; currency?: unknown; krw?: unknown; krwPerUsd?: unknown };
export type KrwDeposit = { currency: 'KRW'; krw: number; krwPerUsd: number };
// USD: dollars with up to 2 decimals. KRW (Gemini is billed in won): whole won plus the
// won-per-dollar rate the user enters; stored as stars at that rate, with the won amount kept.
function parseDeposit(body: DepositInput, allowZero: boolean): { amount: number; krw: KrwDeposit | null } {
  if (body.currency === 'KRW') {
    if (typeof body.krw !== 'string' || !/^\d{1,8}$/.test(body.krw) || Number(body.krw) > 20_000_000 || (Number(body.krw) === 0 && !allowZero)) throw new Error(`0~20,000,000원 범위의 정수로 입력해 주세요.${allowZero ? '' : ' 추가 충전은 0보다 커야 합니다.'}`);
    if (typeof body.krwPerUsd !== 'string' || !/^\d{3,4}(?:\.\d{1,2})?$/.test(body.krwPerUsd) || Number(body.krwPerUsd) < 500 || Number(body.krwPerUsd) > 5000) throw new Error('환율은 1달러당 500~5,000원 범위에서 소수점 두 자리까지 입력해 주세요.');
    const krw = Number(body.krw), krwPerUsd = Number(body.krwPerUsd);
    return { amount: Math.round(krw / krwPerUsd * 1e9), krw: { currency: 'KRW', krw, krwPerUsd } };
  }
  if (body.currency !== undefined && body.currency !== 'USD') throw new Error('통화를 확인해 주세요.');
  if (typeof body.amount !== 'string' || !/^\d{1,5}(?:\.\d{1,2})?$/.test(body.amount) || Number(body.amount) > 10000 || Number(body.amount) < 0 || (Number(body.amount) === 0 && !allowZero)) throw new Error(allowZero ? '0~10,000달러 범위에서 소수점 두 자리까지 입력해 주세요.' : '0~10,000달러 범위에서 소수점 두 자리까지 입력해 주세요. 추가 충전은 0보다 커야 합니다.');
  return { amount: Math.round(Number(body.amount) * 100) * 10_000_000, krw: null };
}
export function depositStars(body: DepositInput & { key?: unknown; initial?: unknown; provider?: unknown }) {
  initStars();
  // Older clients sent no provider; their deposits were for the Claude-only wallet.
  const provider = body.provider === undefined ? 'anthropic' : body.provider;
  if (!isStarProvider(provider)) throw new Error('충전할 AI 제공업체를 선택해 주세요.');
  const { amount, krw } = parseDeposit(body, body.initial === true);
  if (typeof body.key !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(body.key) || typeof body.initial !== 'boolean') throw new Error('등록 정보를 확인해 주세요.');
  db.transaction(() => {
    const prior = db.prepare('SELECT amount_nano,kind,provider FROM star_ledger WHERE request_key=?').get(body.key) as { amount_nano: number; kind: string; provider: string | null } | undefined;
    const kind = body.initial ? '시작 잔액' : '충전 등록';
    if (prior) { if (prior.amount_nano !== amount || prior.kind !== kind || prior.provider !== provider) throw new Error('이미 사용한 등록 요청입니다.'); return; }
    const active = Boolean(db.prepare('SELECT id FROM star_account WHERE id=1').get());
    if (body.initial === active) throw new Error(active ? '시작 잔액이 이미 등록되었습니다. 새로고침해 주세요.' : '먼저 시작 잔액을 등록해 주세요.');
    if (!active) db.prepare('INSERT INTO star_account(id,started_at) VALUES (1,CURRENT_TIMESTAMP)').run();
    db.prepare('INSERT INTO star_ledger(request_key,kind,title,amount_nano,provider,pricing) VALUES (?,?,?,?,?,?)').run(body.key, kind, body.initial ? '시작 잔액 등록' : '충전액 등록', amount, provider, krw ? JSON.stringify(krw) : null);
  }).immediate();
}
// Move one deposit to another provider's wallet. Amount and usage rows are unchanged.
export function moveStarDeposit(body: { id?: unknown; provider?: unknown; expectedProvider?: unknown; key?: unknown }) {
  initStars();
  if (!Number.isSafeInteger(body.id) || Number(body.id) <= 0) throw new Error('변경할 충전 내역을 확인해 주세요.');
  if (!isStarProvider(body.provider) || !isStarProvider(body.expectedProvider)) throw new Error('AI 제공업체를 확인해 주세요.');
  if (typeof body.key !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(body.key)) throw new Error('변경 요청을 확인해 주세요.');
  const { id, provider, expectedProvider, key } = body as { id: number; provider: AiProvider; expectedProvider: AiProvider; key: string };
  db.transaction(() => {
    const prior = db.prepare('SELECT ledger_id,old_provider,new_provider FROM star_provider_edits WHERE request_key=?').get(key) as { ledger_id: number; old_provider: string | null; new_provider: string } | undefined;
    if (prior) { if (prior.ledger_id !== id || prior.new_provider !== provider || prior.old_provider !== expectedProvider) throw new Error('이미 사용한 변경 요청입니다.'); return; }
    const row = db.prepare('SELECT kind,provider FROM star_ledger WHERE id=?').get(id) as { kind: string; provider: string | null } | undefined;
    if (!row || !['시작 잔액', '충전 등록'].includes(row.kind)) throw new Error('시작 잔액과 충전 등록 내역만 업체를 바꿀 수 있습니다.');
    if (row.provider !== expectedProvider) throw new Error('다른 화면에서 업체가 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
    if (row.provider === provider) return;
    db.prepare('INSERT INTO star_provider_edits(request_key,ledger_id,old_provider,new_provider) VALUES (?,?,?,?)').run(key, id, row.provider, provider);
    db.prepare('UPDATE star_ledger SET provider=? WHERE id=?').run(provider, id);
  }).immediate();
}
// Correct one existing deposit, preserving all usage rows and audit history.
export function editStarDeposit(body: DepositInput & { id?: unknown; expectedAmount?: unknown; key?: unknown }) {
  initStars();
  if (!Number.isSafeInteger(body.id) || Number(body.id) <= 0 || !Number.isSafeInteger(body.expectedAmount)) throw new Error('수정할 충전 내역을 확인해 주세요.');
  const { amount, krw } = parseDeposit(body, true);
  if (typeof body.key !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(body.key)) throw new Error('수정 요청을 확인해 주세요.');
  db.transaction(() => {
    const prior = db.prepare('SELECT * FROM star_deposit_edits WHERE request_key=?').get(body.key) as { ledger_id: number; new_amount: number; old_amount: number } | undefined;
    if (prior) { if (prior.ledger_id !== body.id || prior.new_amount !== amount || prior.old_amount !== body.expectedAmount) throw new Error('이미 사용한 수정 요청입니다.'); return; }
    const row = db.prepare('SELECT kind,amount_nano FROM star_ledger WHERE id=?').get(body.id) as { kind: string; amount_nano: number } | undefined;
    if (!row || !['시작 잔액', '충전 등록'].includes(row.kind)) throw new Error('시작 잔액과 충전 등록 내역만 수정할 수 있습니다.');
    if (row.amount_nano !== body.expectedAmount) throw new Error('다른 화면에서 금액이 변경되었습니다. 새로고침 후 다시 수정해 주세요.');
    if (row.amount_nano === amount) return;
    db.prepare('INSERT INTO star_deposit_edits(request_key,ledger_id,old_amount,new_amount) VALUES (?,?,?,?)').run(body.key, body.id, row.amount_nano, amount);
    db.prepare('UPDATE star_ledger SET amount_nano=?, pricing=? WHERE id=?').run(amount, krw ? JSON.stringify(krw) : null, body.id);
  }).immediate();
}
// Set one wallet to the provider's real balance by adding a '잔액 조정' row for the
// difference. Deposits and usage rows are never changed. expectedBalance must match the
// wallet shown to the user, so usage recorded in the meantime is not silently absorbed.
export function reconcileStars(body: DepositInput & { provider?: unknown; expectedBalance?: unknown; key?: unknown }) {
  initStars();
  if (!isStarProvider(body.provider)) throw new Error('잔액을 맞출 AI 제공업체를 선택해 주세요.');
  if (!Number.isSafeInteger(body.expectedBalance)) throw new Error('현재 잔액을 확인하지 못했습니다. 새로고침해 주세요.');
  const { amount: target, krw } = parseDeposit(body, true);
  if (typeof body.key !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(body.key)) throw new Error('요청을 확인해 주세요.');
  const provider = body.provider, key = body.key;
  return db.transaction(() => {
    const prior = db.prepare('SELECT provider,pricing,amount_nano FROM star_ledger WHERE request_key=?').get(key) as { provider: string; pricing: string; amount_nano: number } | undefined;
    if (prior) {
      const saved = JSON.parse(prior.pricing || '{}');
      if (prior.provider !== provider || saved.target !== target || saved.before !== body.expectedBalance) throw new Error('이미 사용한 요청입니다.');
      return { adjusted: prior.amount_nano };
    }
    if (!db.prepare('SELECT id FROM star_account WHERE id=1').get()) throw new Error('먼저 시작 잔액을 등록해 주세요.');
    const current = (db.prepare('SELECT COALESCE(SUM(amount_nano),0) AS balance FROM star_ledger WHERE provider=?').get(provider) as { balance: number }).balance;
    if (current !== body.expectedBalance) throw new Error('그사이 사용 내역이 추가되어 잔액이 바뀌었습니다. 새로고침 후 다시 입력해 주세요.');
    const diff = target - current;
    if (diff === 0) return { adjusted: 0 };
    db.prepare('INSERT INTO star_ledger(request_key,kind,title,amount_nano,provider,pricing) VALUES (?,?,?,?,?,?)')
      .run(key, '잔액 조정', '실제 잔액에 맞춤', diff, provider, JSON.stringify({ target, before: current, ...(krw || {}) }));
    return { adjusted: diff };
  }).immediate();
}
// Won-per-dollar rate of the latest won deposit in a wallet, for an approximate won balance.
export function latestKrwRate(provider: AiProvider): number | null {
  initStars();
  const row = db.prepare(`SELECT json_extract(pricing,'$.krwPerUsd') AS rate FROM star_ledger
    WHERE provider=? AND kind IN ('시작 잔액','충전 등록','잔액 조정') AND json_valid(pricing) AND json_extract(pricing,'$.currency')='KRW' ORDER BY id DESC LIMIT 1`).get(provider) as { rate: number | null } | undefined;
  return typeof row?.rate === 'number' && row.rate > 0 ? row.rate : null;
}
export type CostPeriod = 'today' | 'yesterday' | '24h' | '7d' | 'all';
export function starCostSummary(period: CostPeriod = '24h', scope: StarScope = 'all') {
  initStars();
  let since = period === 'all' ? '0000-01-01 00:00:00'
    : (db.prepare("SELECT datetime('now', ?) AS since").get(period === '7d' ? '-7 days' : '-24 hours') as { since: string }).since;
  let until = '9999-12-31 23:59:59';
  if (period === 'today' || period === 'yesterday') {
    // Ledger timestamps are UTC. Calendar days are always Korea time (UTC+9).
    const bounds = db.prepare(`SELECT
      datetime('now','+9 hours','start of day','-9 hours',?) AS since,
      datetime('now','+9 hours','start of day','-9 hours',?) AS until`)
      .get(period === 'today' ? '+0 days' : '-1 day', period === 'today' ? '+1 day' : '+0 days') as { since: string; until: string };
    ({ since, until } = bounds);
  }
  const groups = db.prepare(`SELECT kind, COUNT(*) AS calls,
    COALESCE(SUM(-amount_nano),0) AS cost,
    SUM(CASE WHEN amount_nano IS NULL THEN 1 ELSE 0 END) AS pending,
    SUM(CASE WHEN completed=0 THEN 1 ELSE 0 END) AS partial
    FROM star_ledger WHERE created_at>=? AND created_at<? AND kind NOT IN ('시작 잔액','충전 등록','잔액 조정') AND (?='all' OR provider=?) GROUP BY kind`)
    .all(since, until, scope, scope) as Array<{ kind: string; calls: number; cost: number; pending: number; partial: number }>;
  const group = (kinds: string[]) => groups.filter(g => kinds.includes(g.kind)).reduce((a, g) => ({
    calls: a.calls + g.calls, cost: a.cost + g.cost, pending: a.pending + g.pending, partial: a.partial + g.partial,
  }), { calls: 0, cost: 0, pending: 0, partial: 0 });
  const chat = group(['채팅', '재생성']), summary = group(['요약']);
  const other = group(groups.filter(g => !['채팅', '재생성', '요약'].includes(g.kind)).map(g => g.kind));
  const cost = chat.cost + summary.cost;
  return { period, scope, chat, summary, other, cost,
    average: chat.calls && !chat.pending && !summary.pending ? cost / chat.calls : null };
}
export function listStars(type: string, kind: string, page: number, period: CostPeriod = '24h', scope: StarScope = 'all') {
  initStars();
  const total = db.prepare('SELECT COALESCE(SUM(amount_nano),0) AS balance, SUM(CASE WHEN amount_nano IS NULL THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN completed=0 THEN 1 ELSE 0 END) AS partial FROM star_ledger').get() as { balance: number; pending: number; partial: number };
  const providers = providerWallets();
  const all = STAR_PROVIDERS.reduce((sum, p) => ({ charged: sum.charged + providers[p].charged, adjusted: sum.adjusted + providers[p].adjusted, used: sum.used + providers[p].used }), { charged: 0, adjusted: 0, used: 0 });
  // 'all' = every row (including any without a provider); a provider tab = that wallet only.
  const selected: Wallet = scope === 'all' ? { ...all, balance: total.balance, pending: total.pending || 0, partial: total.partial || 0 } : providers[scope];
  // "Balance after" follows the wallet being viewed.
  const rows = db.prepare(`WITH history AS (SELECT *,SUM(COALESCE(amount_nano,0)) OVER (${scope === 'all' ? '' : 'PARTITION BY provider '}ORDER BY id) AS balance FROM star_ledger)
    SELECT *, (SELECT COUNT(*) FROM star_deposit_edits e WHERE e.ledger_id=history.id) AS edit_count, (SELECT old_amount FROM star_deposit_edits e WHERE e.ledger_id=history.id ORDER BY e.id LIMIT 1) AS original_amount, (SELECT COUNT(*) FROM star_provider_edits e WHERE e.ledger_id=history.id) AS provider_edit_count FROM history WHERE (?='전체내역' OR (?='구매내역' AND kind IN ('시작 잔액','충전 등록','잔액 조정')) OR (?='이용내역' AND kind NOT IN ('시작 잔액','충전 등록','잔액 조정'))) AND (?='전체' OR kind=?) AND (?='all' OR provider=?) ORDER BY id DESC LIMIT 51 OFFSET ?`).all(type,type,type,kind,kind,scope,scope,page*50);
  return { active: starsActive(), ...total, pending: total.pending || 0, partial: total.partial || 0, providers, geminiKrwRate: latestKrwRate('gemini'), scope, selected, rows: rows.slice(0,50), more: rows.length > 50, costs: starCostSummary(period, scope) };
}
