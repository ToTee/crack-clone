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
    CREATE TABLE IF NOT EXISTS star_deposit_edits (id INTEGER PRIMARY KEY AUTOINCREMENT, request_key TEXT NOT NULL UNIQUE, ledger_id INTEGER NOT NULL, old_amount INTEGER NOT NULL, new_amount INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
}
export function starsActive() {
  initStars();
  return Boolean(db.prepare('SELECT id FROM star_account WHERE id=1').get());
}
// Lightweight balance read for the chat UI; no history pagination or AI calls.
export function starBalance() {
  initStars();
  const total = db.prepare('SELECT COALESCE(SUM(amount_nano),0) AS balance, SUM(CASE WHEN amount_nano IS NULL THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN completed=0 THEN 1 ELSE 0 END) AS partial FROM star_ledger').get() as { balance: number; pending: number; partial: number };
  return { active: starsActive(), balance: total.balance, pending: total.pending || 0, partial: total.partial || 0 };
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
  db.prepare('INSERT OR IGNORE INTO star_ledger(request_key,kind,title,amount_nano,model,tokens,completed,pricing) VALUES (?,?,?,?,?,?,?,?)')
    .run(key, context.kind || '기타 생성', character?.name || 'AI 생성', amount, model, JSON.stringify(usage), completed ? 1 : 0, JSON.stringify({ rates, date: '2026-09-21', provider: context.provider || 'anthropic', usageMissing: context.usageMissing || false, note: model.startsWith('deepseek-') ? '요청 시작 시각(UTC)의 혼잡/비혼잡 단가 추정입니다. 중국 공휴일 할인과 시간 경계를 넘긴 요청은 실제 청구액과 다를 수 있습니다.' : null, cacheMinutes: model.startsWith('claude-') ? (context.cacheTtl === '1h' ? 60 : 5) : null, inputBreakdown: context.inputBreakdown }));
}
export function depositStars(body: { amount?: unknown; key?: unknown; initial?: unknown }) {
  initStars();
  if (typeof body.amount !== 'string' || !/^\d{1,5}(?:\.\d{1,2})?$/.test(body.amount) || Number(body.amount) > 10000 || Number(body.amount) < 0 || (Number(body.amount) === 0 && body.initial !== true)) throw new Error('0~10,000달러 범위에서 소수점 두 자리까지 입력해 주세요. 추가 충전은 0보다 커야 합니다.');
  if (typeof body.key !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(body.key) || typeof body.initial !== 'boolean') throw new Error('등록 정보를 확인해 주세요.');
  const amount = Math.round(Number(body.amount) * 100) * 10_000_000;
  db.transaction(() => {
    const prior = db.prepare('SELECT amount_nano,kind FROM star_ledger WHERE request_key=?').get(body.key) as { amount_nano: number; kind: string } | undefined;
    const kind = body.initial ? '시작 잔액' : '충전 등록';
    if (prior) { if (prior.amount_nano !== amount || prior.kind !== kind) throw new Error('이미 사용한 등록 요청입니다.'); return; }
    const active = Boolean(db.prepare('SELECT id FROM star_account WHERE id=1').get());
    if (body.initial === active) throw new Error(active ? '시작 잔액이 이미 등록되었습니다. 새로고침해 주세요.' : '먼저 시작 잔액을 등록해 주세요.');
    if (!active) db.prepare('INSERT INTO star_account(id,started_at) VALUES (1,CURRENT_TIMESTAMP)').run();
    db.prepare('INSERT INTO star_ledger(request_key,kind,title,amount_nano) VALUES (?,?,?,?)').run(body.key, kind, body.initial ? '시작 잔액 등록' : '충전액 등록', amount);
  }).immediate();
}
// Correct one existing deposit, preserving all usage rows and audit history.
export function editStarDeposit(body: { id?: unknown; amount?: unknown; expectedAmount?: unknown; key?: unknown }) {
  initStars();
  if (!Number.isSafeInteger(body.id) || Number(body.id) <= 0 || !Number.isSafeInteger(body.expectedAmount)) throw new Error('수정할 충전 내역을 확인해 주세요.');
  if (typeof body.amount !== 'string' || !/^\d{1,5}(?:\.\d{1,2})?$/.test(body.amount) || Number(body.amount) > 10000) throw new Error('0~10,000달러 범위에서 소수점 두 자리까지 입력해 주세요.');
  if (typeof body.key !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(body.key)) throw new Error('수정 요청을 확인해 주세요.');
  const amount = Math.round(Number(body.amount) * 100) * 10_000_000;
  db.transaction(() => {
    const prior = db.prepare('SELECT * FROM star_deposit_edits WHERE request_key=?').get(body.key) as { ledger_id: number; new_amount: number; old_amount: number } | undefined;
    if (prior) { if (prior.ledger_id !== body.id || prior.new_amount !== amount || prior.old_amount !== body.expectedAmount) throw new Error('이미 사용한 수정 요청입니다.'); return; }
    const row = db.prepare('SELECT kind,amount_nano FROM star_ledger WHERE id=?').get(body.id) as { kind: string; amount_nano: number } | undefined;
    if (!row || !['시작 잔액', '충전 등록'].includes(row.kind)) throw new Error('시작 잔액과 충전 등록 내역만 수정할 수 있습니다.');
    if (row.amount_nano !== body.expectedAmount) throw new Error('다른 화면에서 금액이 변경되었습니다. 새로고침 후 다시 수정해 주세요.');
    if (row.amount_nano === amount) return;
    db.prepare('INSERT INTO star_deposit_edits(request_key,ledger_id,old_amount,new_amount) VALUES (?,?,?,?)').run(body.key, body.id, row.amount_nano, amount);
    db.prepare('UPDATE star_ledger SET amount_nano=? WHERE id=?').run(amount, body.id);
  }).immediate();
}
export type CostPeriod = 'today' | 'yesterday' | '24h' | '7d' | 'all';
export function starCostSummary(period: CostPeriod = '24h') {
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
    FROM star_ledger WHERE created_at>=? AND created_at<? AND kind NOT IN ('시작 잔액','충전 등록') GROUP BY kind`)
    .all(since, until) as Array<{ kind: string; calls: number; cost: number; pending: number; partial: number }>;
  const group = (kinds: string[]) => groups.filter(g => kinds.includes(g.kind)).reduce((a, g) => ({
    calls: a.calls + g.calls, cost: a.cost + g.cost, pending: a.pending + g.pending, partial: a.partial + g.partial,
  }), { calls: 0, cost: 0, pending: 0, partial: 0 });
  const chat = group(['채팅', '재생성']), summary = group(['요약']);
  const other = group(groups.filter(g => !['채팅', '재생성', '요약'].includes(g.kind)).map(g => g.kind));
  const cost = chat.cost + summary.cost;
  return { period, chat, summary, other, cost,
    average: chat.calls && !chat.pending && !summary.pending ? cost / chat.calls : null };
}
export function listStars(type: string, kind: string, page: number, period: CostPeriod = '24h') {
  initStars();
  const total = db.prepare('SELECT COALESCE(SUM(amount_nano),0) AS balance, SUM(CASE WHEN amount_nano IS NULL THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN completed=0 THEN 1 ELSE 0 END) AS partial FROM star_ledger').get() as { balance: number; pending: number; partial: number };
  const rows = db.prepare(`WITH history AS (SELECT *,SUM(COALESCE(amount_nano,0)) OVER (ORDER BY id) AS balance FROM star_ledger)
    SELECT *, (SELECT COUNT(*) FROM star_deposit_edits e WHERE e.ledger_id=history.id) AS edit_count, (SELECT old_amount FROM star_deposit_edits e WHERE e.ledger_id=history.id ORDER BY e.id LIMIT 1) AS original_amount FROM history WHERE (?='전체내역' OR (?='구매내역' AND kind IN ('시작 잔액','충전 등록')) OR (?='이용내역' AND kind NOT IN ('시작 잔액','충전 등록'))) AND (?='전체' OR kind=?) ORDER BY id DESC LIMIT 51 OFFSET ?`).all(type,type,type,kind,kind,page*50);
  return { active: starsActive(), ...total, pending: total.pending || 0, partial: total.partial || 0, rows: rows.slice(0,50), more: rows.length > 50, costs: starCostSummary(period) };
}
