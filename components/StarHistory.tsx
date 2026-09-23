'use client';
import { useEffect, useRef, useState } from 'react';
import type { InputBreakdown, CostPeriod, starCostSummary } from '@/lib/stars';
import { Star, ReceiptText, Info, Plus, RefreshCw } from 'lucide-react';
const tabs = ['전체내역', '구매내역', '이용내역'] as const;
type Row = { id: number; created_at: string; kind: string; title: string; amount_nano: number | null; balance: number; model: string | null; tokens: string | null; completed: number; pricing: string | null; edit_count?: number; original_amount?: number | null };
type Data = { active: boolean; balance: number; pending: number; partial: number; rows: Row[]; more: boolean; costs: ReturnType<typeof starCostSummary> };
const stars = (nano: number) => (nano / 1e6).toLocaleString('ko-KR', { maximumFractionDigits: 6 });
const usd = (nano: number) => (nano / 1e9).toLocaleString('en-US', { maximumFractionDigits: 9 });
const date = (value: string) => new Date(value.replace(' ', 'T') + 'Z').toLocaleDateString('ko-KR');
const time = (value: string) => new Date(value.replace(' ', 'T') + 'Z').toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

const turnRanges = (ranges: Array<[number, number]>) => ranges.length ? ranges.map(([start, end]) => start === end ? `${start}턴` : `${start}~${end}턴`).join(', ') : '없음';

function InputDetails({ pricing }: { pricing: string | null }) {
  const b = pricing ? JSON.parse(pricing).inputBreakdown as InputBreakdown | undefined : undefined;
  if (!b) return <p className="mt-3 text-xs text-gray-400">전송 구성 기록 없음 · 업데이트 이후 새 채팅부터 표시됩니다.</p>;
  const rows = [
    ['캐시 대상 설정·이미지 목록', b.cachedChars],
    [`최근 대화 원문 (${b.historyMessages ?? 0}개 메시지 · 사용자 발화 ${b.historyTurns ?? 0}회)`, b.historyChars],
    [`요약 기억 (${b.memoryCount}개)`, b.memoryChars],
    [`키워드북 (${b.keywords.length}개 · 지침 포함)`, b.keywordChars],
    ['이번 사용자 입력', b.requestChars], ['기타 지침', b.otherChars], ['전체 전송 텍스트', b.totalChars],
  ] as const;
  return <div className="mt-5 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
    <h3 className="font-semibold text-gray-900">전송 내용 구성</h3>
    <p className="my-2 leading-5">아래는 토큰이 아닌 글자 수입니다. 캐시 대상도 포함하므로 위의 일반 입력 토큰과 직접 비교할 수 없습니다.</p>
    <dl className="space-y-2">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd className="shrink-0">{(value ?? 0).toLocaleString('ko-KR')}자</dd></div>)}</dl>
    {b.media && <div className="mt-3 space-y-1 border-t border-gray-200 pt-3">
      <h4 className="font-semibold text-gray-900">이미지 선택 정보</h4>
      <p>등록 {b.media.imageCount.toLocaleString('ko-KR')}장 · 전송 선택지 {b.media.choiceCount.toLocaleString('ko-KR')}개</p>
      <p>이미지 목록·선택 지침: 이전 방식 {b.media.previousChars.toLocaleString('ko-KR')}자 → 실제 전송 {b.media.sentChars.toLocaleString('ko-KR')}자</p>
      <p className="leading-5 text-gray-500">{b.media.mode === 'nas' ? '같은 분류·상황·조건의 사진을 NAS에서 선택합니다.' : '이 작품은 기존 압축 목록이 더 짧아 해당 방식을 사용합니다.'} 글자 수 비교이며 실제 비용 절감률을 뜻하지 않습니다.</p>
    </div>}
    {b.memory && <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
      <h4 className="font-semibold text-gray-900">원문이 남은 이유 · 요청 당시</h4>
      <p>원문 유지 설정: 최근 {b.memory.recentTurns}턴 · 완료된 대화: {b.memory.completedTurns}턴</p>
      <p>유효한 자동 요약으로 덮인 범위: {turnRanges(b.memory.coveredRanges)} ({b.memory.coveredTurns}턴)</p>
      <p>요약으로 덮이지 않아 원문 보존: {turnRanges(b.memory.uncoveredRanges)} ({b.memory.uncoveredTurns}턴)</p>
      <p>요약됐지만 최근 원문으로 보존: {turnRanges(b.memory.retainedCoveredRanges)} ({b.memory.retainedCoveredTurns}턴)</p>
      <p>이번에 보낸 자동 요약 범위: {turnRanges(b.memory.sentSummaryRanges)}</p>
      {b.memory.archiveCount !== undefined && <p>사건 기록 {b.memory.archiveCount}개 중 {b.memory.retrievedCount}개 검색 · 중요 사실·관계·목표 {b.memory.recordCount}개 · 과거 원문 {b.memory.recalledTurns?.join(', ') || '없음'}{b.memory.recalledTurns?.length ? '턴' : ''}</p>}
      <p className="leading-5 text-gray-500">1턴은 사용자 입력과 AI 응답 한 쌍입니다. 자동 요약은 {b.memory.summaryInterval}턴 단위로 처리하며, 미요약·숨김·무효화 등으로 요약이 덮지 못한 원문은 보존합니다. 수동 기억과 미완료 메시지는 위 턴 집계에서 제외됩니다.</p>
    </div>}
    {b.memoryCachedChars !== undefined && <p className="mt-3 text-gray-500">요약 기억 중 캐시 대상: {b.memoryCachedChars.toLocaleString('ko-KR')}자. 캐시 적용과 저장 과금 방식은 제공업체마다 다릅니다. 실제 적용 여부는 위 캐시 토큰 사용량을 확인해 주세요.</p>}
    {b.keywordExcludeStatus !== undefined && <p className="mt-3 text-gray-500">키워드북 검색: 이번 입력 + 직전 4개 메시지 · 일반 검색의 AI 상태창 {b.keywordExcludeStatus ? '제외' : '포함'}</p>}
    {!!b.keywords.length && <div className="mt-3 border-t border-gray-200 pt-3"><p className="mb-2 font-semibold">호출된 키워드북 · 저장된 정보 원문 분량</p><ul className="space-y-1">{b.keywords.map((item, index) => <li key={index} className="py-1"><div className="flex justify-between gap-3"><span className="min-w-0 break-words">{item.title}{item.mode === 'direct' ? ' · 직접 등장' : ''}</span><span className="shrink-0">{item.chars.toLocaleString('ko-KR')}자</span></div>{item.matches?.map((match, i) => <p key={i} className="mt-1 break-words leading-5 text-gray-500">‘{match.keyword}’ 일치: {match.sources.join(', ')}</p>)}</li>)}</ul></div>}
  </div>;
}

export default function StarHistory() {
  const [period, setPeriod] = useState<CostPeriod>('24h');
  const [tab, setTab] = useState<typeof tabs[number]>('전체내역');
  const [filter, setFilter] = useState('전체');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [loadedQuery, setLoadedQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const queryKey = JSON.stringify([tab, filter, page, period]);
  const hasCurrentData = data !== null && loadedQuery === queryKey;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const editRequest = useRef<{ id: number; amount: string; expectedAmount: number; key: string } | null>(null);
  const [initialMode, setInitialMode] = useState(true);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const submitting = useRef(false);
  const request = useRef<{ amount: string; initial: boolean; key: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    fetch(`/api/stars?type=${encodeURIComponent(tab)}&kind=${encodeURIComponent(filter)}&page=${page}&period=${period}`, { cache: 'no-store', signal: controller.signal })
      .then(async res => { const body = await res.json(); if (!res.ok) throw new Error(body.error); return body; })
      .then(body => { if (!controller.signal.aborted) { setData(body); setLoadedQuery(JSON.stringify([tab, filter, page, period])); } })
      .catch(err => { if (!controller.signal.aborted) setError(err.message || '불러오지 못했습니다.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tab, filter, page, period, reload]);
  useEffect(() => {
    const refresh = () => { if (!document.hidden) setReload(n => n + 1); };
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(timer); };
  }, []);
  const filters = tab === '구매내역' ? ['전체', '시작 잔액', '충전 등록'] : tab === '이용내역' ? ['전체', '채팅', '재생성', '요약', '기타 생성'] : ['전체', '시작 잔액', '충전 등록', '채팅', '재생성', '요약', '기타 생성'];
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!data || submitting.current) return;
    submitting.current = true; setSaving(true); setFormError('');
    const initial = initialMode;
    if (!request.current || request.current.amount !== amount || request.current.initial !== initial) request.current = { amount, initial, key: crypto.randomUUID() };
    try {
      if (editing && (!editRequest.current || editRequest.current.id !== editing.id || editRequest.current.amount !== amount)) editRequest.current = { id: editing.id, amount, expectedAmount: editing.amount_nano!, key: crypto.randomUUID() };
      const res = await fetch('/api/stars', { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing ? editRequest.current : request.current) });
      const result = await res.json(); if (!res.ok) throw new Error(result.error);
      setForm(false); setAmount(''); request.current = null;
      window.dispatchEvent(new Event('stars-changed'));
      setNotice(editing ? '충전액을 수정하고 잔액을 다시 계산했습니다.' : initial ? '시작 잔액을 등록했습니다. 지금부터 AI 사용분이 차감됩니다.' : '충전액을 등록했습니다.');
      setEditing(null); editRequest.current = null;
      setPage(0); setReload(n => n + 1);
    } catch (err) { setFormError(err instanceof Error ? err.message : '등록하지 못했습니다. 다시 시도해 주세요.'); }
    finally { submitting.current = false; setSaving(false); }
  }
  return <main className="mx-auto max-w-3xl px-4 pb-12 pt-8 sm:px-8 sm:pt-12">
    <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><h1 className="text-xl font-bold">나의 별</h1><span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-sm text-gray-600"><Star className="h-4 w-4 fill-amber-400 text-amber-500" />잔액 <strong className="tabular-nums text-gray-900">{data?.active ? stars(data.balance) : '—'}</strong>별</span></div>
      <div className="flex gap-2"><button type="button" title="새로고침" aria-label="새로고침" disabled={loading} onClick={() => setReload(n => n + 1)} className="rounded-full border border-gray-200 p-2 text-gray-500 disabled:opacity-40"><RefreshCw className="h-4 w-4" /></button><button type="button" disabled={!data || loading} onClick={() => { setEditing(null); editRequest.current = null; setAmount(''); request.current = null; setInitialMode(!data?.active); setForm(true); setFormError(''); }} className="flex items-center gap-1 rounded-full bg-sky-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Plus className="h-4 w-4" />{data?.active ? '충전액 등록' : '현재 잔액 등록'}</button></div>
    </div>
    {notice && <p role="status" className="mb-4 text-sm text-sky-700">{notice}</p>}
    {form && <form ref={formRef} onSubmit={save} className="mb-6 space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-5">
      <h2 className="font-semibold">{editing ? '등록한 금액 수정' : initialMode ? '시작 잔액 등록' : '충전액 등록'}</h2>
      <p className="text-xs leading-5 text-gray-500">{editing ? `기존 $${usd(editing.amount_nano!)}를 올바른 금액으로 바꿉니다. 추가 충전이 아니며 차액만 잔액에 반영됩니다. 0달러는 해당 등록 취소와 같습니다.` : initialMode ? '이 앱에서 관리할 AI 사용 예산을 달러로 입력하세요. 이전 사용분은 소급 차감하지 않습니다.' : '추가할 금액을 입력하세요. 이 앱의 통합 사용 예산에만 반영되며 실제 API 결제는 발생하지 않습니다.'}</p>
      <label className="block text-sm" htmlFor="star-dollars">금액 (USD)</label><input id="star-dollars" type="number" inputMode="decimal" min={editing || initialMode ? '0' : '0.01'} max="10000" step="0.01" required disabled={saving} value={amount} onChange={e => setAmount(e.target.value)} placeholder="예: 20.61" className="w-full rounded-xl border border-gray-200 bg-white p-3" />
      <p className="text-sm text-sky-700">{amount && Number.isFinite(Number(amount)) ? `${(Number(amount) * 1000).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}별` : '—별'} · $1 = 1,000별</p>
      {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
      <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setForm(false)} className="rounded-lg px-4 py-2 text-sm text-gray-500">닫기</button><button disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? '저장 중…' : editing ? '수정 저장' : '등록하기'}</button></div>
    </form>}
    <section aria-label="대화 비용 집계" className="mb-6 rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">요약을 포함한 대화 비용</h2>
        <select aria-label="비용 집계 기간" value={period} onChange={e => setPeriod(e.target.value as CostPeriod)} className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs">
          <option value="today">오늘</option><option value="yesterday">어제</option><option value="24h">최근 24시간</option><option value="7d">최근 7일</option><option value="all">전체 기록</option>
        </select>
      </div>
      {(period === 'today' || period === 'yesterday') && <p className="mt-2 text-xs text-gray-500">한국 시간(KST) 자정을 기준으로 집계합니다.</p>}
      {data?.costs && data.costs.period === period ? <>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
          {[
            ['채팅·재생성', `${stars(data.costs.chat.cost)}별`, `${data.costs.chat.calls}회`],
            ['요약', `${stars(data.costs.summary.cost)}별`, `${data.costs.summary.calls}회`],
            ['합계', `${stars(data.costs.cost)}별`, '계산된 비용'],
            ['채팅 호출당 평균', data.costs.average === null ? '—' : `${stars(data.costs.average)}별`, '요약 비용 포함'],
          ].map(([label, value, detail]) => <div key={label}><dt className="text-gray-500">{label}</dt><dd className="mt-1 break-words text-base font-bold tabular-nums text-gray-900">{value}</dd><dd className="mt-1 text-gray-500">{detail}</dd></div>)}
        </dl>
        <p className="mt-4 text-xs leading-5 text-gray-500">평균 = (채팅 + 재생성 + 요약 비용) ÷ 채팅·재생성 호출 수. 중단된 호출도 포함하며, 완료된 대화 턴 수와는 다릅니다.</p>
        <p className="mt-1 text-xs leading-5 text-gray-500">전체 작품의 기록 시각 기준이며, 아래 내역 필터·페이지와 무관합니다. 기간 이전 대화의 요약 비용이 포함될 수 있습니다. 충전액은 제외됩니다. GPT·Gemini·DeepSeek 사용량은 이번 업데이트 이후 기록부터 포함합니다.</p>
        {!!data.costs.other.calls && <p className="mt-2 text-xs text-gray-500">기타 생성: {stars(data.costs.other.cost)}별 · {data.costs.other.calls}회 (위 합계·평균에서 제외)</p>}
        {!!(data.costs.chat.pending + data.costs.summary.pending) && <p className="mt-2 text-xs text-amber-700">대화 관련 계산 대기 {data.costs.chat.pending + data.costs.summary.pending}건이 있어 합계는 일부 금액이며 평균은 표시하지 않습니다.</p>}
        {!!(data.costs.chat.partial + data.costs.summary.partial) && <p className="mt-2 text-xs text-amber-700">부분 사용량 {data.costs.chat.partial + data.costs.summary.partial}건이 포함되어 실제 청구액과 다를 수 있습니다.</p>}
      </> : <p className="mt-4 text-xs text-gray-500">비용 집계를 불러오는 중입니다.</p>}
    </section>
    <nav aria-label="내역 종류" className="flex border-b border-gray-200">{tabs.map(item => <button key={item} type="button" aria-pressed={tab === item} onClick={() => { setTab(item); setFilter('전체'); setPage(0); }} className={`flex-1 border-b-2 px-2 py-4 text-sm font-semibold ${tab === item ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}>{item}</button>)}</nav>
    <p className="flex items-start gap-2 bg-gray-50 px-4 py-4 text-xs leading-5 text-gray-500"><Info className="mt-0.5 h-4 w-4 shrink-0" /><span>$1 = 1,000별 · 네 제공업체의 API 사용량과 표준 유료 단가로 계산하는 통합 사용 예산입니다. 무료 등급·할인·세금은 반영하지 않습니다. 기존 잔액은 유지됩니다. 실제 제공업체별 잔액과 자동 동기화되지 않으며, 잔액이 부족해도 채팅은 차단하지 않습니다.</span></p>
    {!!data?.pending && <p role="status" className="mt-3 text-sm text-amber-700">계산 대기 {data.pending}건이 잔액에 반영되지 않았습니다. 해당 내역의 모델·사용량을 확인해 주세요.</p>}
    {!!data?.partial && <p className="mt-2 text-xs text-amber-700">중단된 응답 {data.partial}건은 수신한 부분 사용량 기준입니다. 실제 청구액과 다를 수 있습니다.</p>}
    <div className="my-6 flex flex-wrap gap-2">{filters.map(item => <button key={item} type="button" aria-pressed={filter === item} onClick={() => { setFilter(item); setPage(0); }} className={`rounded-full border px-4 py-2 text-xs font-medium ${filter === item ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500'}`}>{item}</button>)}</div>
    {error && <p role="alert" className="py-6 text-sm text-red-600">{error} <button onClick={() => setReload(n => n + 1)} className="underline">다시 시도</button></p>}
    <section aria-label={tab} aria-busy={loading}>
      {!hasCurrentData && loading ? <p className="py-12 text-center text-sm text-gray-400">내역을 불러오는 중…</p> : hasCurrentData && (data?.rows.length ? data.rows.map((row, index) => <div key={row.id}>
        {(index === 0 || date(data.rows[index - 1].created_at) !== date(row.created_at)) && <h2 className="pb-2 pt-5 text-sm font-semibold text-gray-500">{date(row.created_at)}</h2>}
        <details open={expanded.has(row.id)} className="border-b border-gray-100 py-5"><summary onClick={event => {
            event.preventDefault();
            setExpanded(previous => { const next = new Set(previous); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; });
          }} className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-lg focus-visible:outline-2 focus-visible:outline-sky-600 [&::-webkit-details-marker]:hidden"><div className="min-w-0"><p className="break-words text-sm font-semibold">{row.title}</p><p className="mt-2 text-xs text-gray-400">{time(row.created_at)} · {row.kind} · 상세 ⌄</p></div><div className="shrink-0 text-right"><p className={`text-base font-bold tabular-nums ${(row.amount_nano ?? 0) > 0 ? 'text-sky-600' : 'text-gray-700'}`}>{row.amount_nano === null ? '계산 대기' : `${row.amount_nano > 0 ? '+' : row.amount_nano < 0 ? '−' : ''}${stars(Math.abs(row.amount_nano))}`}</p><p className="mt-1 text-xs text-gray-400">{row.completed ? '별' : '별 · 부분 사용량'}</p></div></summary>
          <dl className="mt-4 space-y-2 border-l-2 border-gray-100 pl-3 text-xs text-gray-500"><div className="flex justify-between gap-3"><dt>금액</dt><dd>{row.amount_nano === null ? '단가 또는 사용량 확인 필요' : `$${usd(Math.abs(row.amount_nano))}`}</dd></div><div className="flex justify-between gap-3"><dt>이후 잔액 (계산 완료분)</dt><dd>{stars(row.balance)}별</dd></div>{row.model && <div className="flex justify-between gap-3"><dt>모델</dt><dd className="break-all text-right">{row.model}</dd></div>}{row.tokens && !JSON.parse(row.pricing || '{}').usageMissing && Object.entries(JSON.parse(row.tokens) as Record<string, number>).map(([key, value]) => <div key={key} className="flex justify-between gap-3"><dt>{{ input: '입력 토큰', output: '출력 토큰', write: '캐시 저장 토큰', read: '캐시 읽기 토큰' }[key] || key}</dt><dd>{value.toLocaleString('ko-KR')}</dd></div>)}{row.pricing && <div className="space-y-1 text-right"><p>100만 토큰당 USD (입력 / 출력 / 캐시 저장 / 읽기)</p><p>{(JSON.parse(row.pricing).rates || []).map((rate: number) => `$${rate}`).join(" / ")}</p><p>단가 기준: {JSON.parse(row.pricing).date} {JSON.parse(row.pricing).cacheMinutes ? `· 캐시 저장 ${JSON.parse(row.pricing).cacheMinutes === 60 ? '1시간' : '5분'}` : '· 제공업체 자동 캐시'}</p></div>}</dl>
        {!!row.edit_count && <p className="mt-3 text-xs text-gray-500">금액 수정 {row.edit_count}회 · 처음 등록한 금액 ${usd(row.original_amount!)} · 현재 ${usd(row.amount_nano!)}</p>}
        {['시작 잔액', '충전 등록'].includes(row.kind) && <button type="button" disabled={saving} onClick={() => { setEditing(row); editRequest.current = null; setInitialMode(row.kind === '시작 잔액'); setAmount((row.amount_nano! / 1e9).toFixed(2)); setForm(true); setFormError(''); requestAnimationFrame(() => formRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })); }} className="mt-3 rounded-lg border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-700 disabled:opacity-50">충전액 수정</button>}
        {JSON.parse(row.pricing || '{}').note && <p className="mt-2 text-xs text-gray-500">{JSON.parse(row.pricing!).note}</p>}
        {JSON.parse(row.pricing || '{}').usageMissing && <p className="mt-3 text-xs text-amber-700">제공업체의 사용량 정보를 받지 못해 금액을 계산하지 않았습니다.</p>}
        {row.tokens && <InputDetails pricing={row.pricing} />}</details></div>) : <div className="py-16 text-center"><ReceiptText className="mx-auto mb-4 h-9 w-9 text-gray-300" /><p className="text-sm text-gray-600">{data?.active ? '해당 내역이 없습니다.' : '시작 잔액을 등록하면 별 기록이 시작됩니다.'}</p></div>)}
    </section>
    {hasCurrentData && <div className="mt-6 flex items-center justify-center gap-5 text-sm"><button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-30">이전</button><span>{page + 1}</span><button disabled={!data?.more} onClick={() => setPage(p => p + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-30">다음</button></div>}
  </main>;
}
