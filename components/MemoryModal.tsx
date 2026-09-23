'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, ChevronRight, MoreHorizontal, RefreshCw } from 'lucide-react';

const labels: Record<string, string> = { long: '장기 기억', short: '단기 기억', facts: '중요 사실', scene: '현재 장면', relations: '관계도', goals: '목표' };
type Item = { id: number; kind: string; title: string; content: string; start_turn: number; end_turn: number; manual: number; record_key?: string; state?: string; updated_at: string };
type Snapshot = { relationGroups?: Array<{name: string; items: Item[]}>; memoryMode?: string; summaryInterval: number; recentTurns: number; memories: Item[]; turns: number; summarizedTurns: number; pending: number; running: boolean; error: string };

export default function MemoryModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [kind, setKind] = useState('long');
  const [newest, setNewest] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Item> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endpoint = `/api/chats/${encodeURIComponent(sessionId)}/memory`;
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '기억을 불러오지 못했습니다.');
    setData(result);
  }, [endpoint]);
  useEffect(() => {
    let alive = true;
    const refresh = () => { if (alive) void load().catch(e => { if (alive) setError(e.message); }); };
    refresh();
    const timer = setInterval(refresh, 3000);
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', keydown);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('keydown', keydown); };
  }, [load, onClose]);
  async function mutate(method: string, body: object) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '기억을 저장하지 못했습니다.');
      setData(result); setDraft(null); setMenu(null);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }
  const items = (data?.memories || []).filter(m => m.kind === kind).sort((a, b) => newest ? b.end_turn - a.end_turn || b.id - a.id : a.end_turn - b.end_turn || a.id - b.id);
  const groups = [...(data?.relationGroups || [])].map(g=>({...g,items:[...g.items].sort((a,b)=>newest ? b.end_turn-a.end_turn || b.id-a.id : a.end_turn-b.end_turn || a.id-b.id)})).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  const renderItem = (item: Item) => <article key={item.id} className="border-b border-slate-200 py-3">
          <div className="flex items-center gap-2">
            <button aria-expanded={expanded === item.id} onClick={() => setExpanded(expanded === item.id ? null : item.id)} className="flex flex-1 min-w-0 items-center gap-2 py-2 text-left"><ChevronRight size={16} className={`shrink-0 transition-transform ${expanded === item.id ? 'rotate-90' : ''}`} /><span className="truncate">{kind === 'relations' ? item.record_key || item.content.split('\n')[0] : item.title}{item.state === 'resolved' ? ' · 완료/종료' : ''}</span></button>
            {editing && <button className="text-sm text-sky-700" onClick={() => setDraft({ ...item })}>수정</button>}
            <button aria-label={`${item.title} 메뉴`} onClick={() => setMenu(menu === item.id ? null : item.id)} className="p-2 text-slate-500"><MoreHorizontal size={18} /></button>
          </div>
          {menu === item.id && <div className="flex justify-end gap-3 pb-2 text-sm"><button onClick={() => { setDraft({ ...item }); setMenu(null); }} className="text-sky-700">수정</button><button disabled={busy} className="text-red-600" onClick={() => { if (confirm('이 기억을 삭제하시겠습니까? 원본 채팅은 삭제되지 않습니다.')) void mutate('DELETE', { id: item.id }); }}>삭제</button></div>}
          {expanded === item.id && <div className="pl-6 pb-2"><p className="mb-2 text-xs text-slate-500">{item.manual ? '직접 추가·수정한 기억' : `${item.start_turn}~${item.end_turn}턴`}</p><p className="whitespace-pre-wrap break-words text-[15px] leading-7">{item.content}</p></div>}
        </article>;
  return <div className="fixed inset-0 z-[70] bg-black/30 flex items-center justify-center p-3" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label="요약 메모리" className="w-full max-w-xl max-h-[90dvh] flex flex-col rounded-2xl bg-white shadow-xl text-slate-800" onClick={e => e.stopPropagation()}>
      <header className="flex justify-between items-center px-5 pt-5 pb-3"><h2 className="text-lg font-bold">요약 메모리</h2><button aria-label="닫기" onClick={onClose} className="p-2"><X size={20} /></button></header>
      <div className="px-5 flex gap-2 flex-wrap" role="tablist" aria-label="기억 종류">
        {Object.entries(labels).map(([key, label]) => <button key={key} role="tab" aria-selected={kind === key} onClick={() => { setKind(key); setExpanded(null); setMenu(null); }} className={`rounded-full px-3 py-2 text-sm border ${kind === key ? 'bg-sky-600 text-white border-sky-600' : 'bg-white border-slate-200 text-slate-600'}`}>{label}</button>)}
      </div>
      <div className="px-5 py-3 text-xs text-slate-500 space-y-1">
        <p>1턴 = 내 메시지 + AI 답변 · 단기 {data?.summaryInterval ?? '…'}턴마다 요약 · 새 기억은 사실별 보존</p>
        <p>{data ? `${data.turns}턴 중 ${data.summarizedTurns}턴 요약됨` : '불러오는 중…'}{data?.running ? ' · 자동 요약 중…' : data?.pending ? ` · 대기 ${data.pending}개` : ''}</p>
        <p>설정한 요약 모델로 처리하며 API 비용이 발생합니다. 중요 사실·관계·미완료 목표와 최근 {data?.recentTurns ?? '…'}턴, 미요약 원문을 참고하며 과거 사건은 관련 기록을 검색합니다. 원본 채팅은 유지됩니다.</p>
      </div>
      {kind === 'relations' && <p className="px-5 pb-2 text-xs text-slate-500">인물별 관계 기록입니다. 펼치면 출처 턴을 확인하실 수 있습니다. 기존 공동 기록은 여러 인물 아래 표시될 수 있으며 수정 시 같은 원본에 반영됩니다.</p>}
      {(error || data?.error) && <p role="alert" className="mx-5 mb-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error || data?.error}{data?.error && <> 자동 재시도가 중지되었습니다. 실패한 구간은 원문을 계속 사용합니다. ‘요약 갱신’을 누르면 API 비용이 발생하는 재시도를 진행합니다.</>}</p>}
      <div className="flex items-center justify-between px-5 py-2"><b>{kind === 'relations' && data?.relationGroups ? `총 ${groups.length}명/분류` : `총 ${items.length}개`}</b><button onClick={() => setNewest(!newest)} className="text-sm text-slate-500">{newest ? '최신순' : '오래된순'} ↕</button></div>
      <div className="overflow-y-auto min-h-36 flex-1 px-5">
        {!items.length && <p className="py-12 text-center text-sm text-slate-500">{kind === 'long' ? '기존 장기 기억을 보관합니다. 새로 추출한 내용은 중요 사실·관계도·목표·현재 장면에서 확인하실 수 있습니다.' : kind === 'short' ? `미요약 대화가 ${data?.summaryInterval ?? '설정한'}턴 쌓이면 단기 기억이 생성됩니다.` : '요약에서 확인한 내용이 여기에 표시됩니다.'}</p>}
        {kind === 'relations' && data?.relationGroups ? groups.map(group => <section key={group.name} className="py-2">
          <button aria-expanded={person === group.name} onClick={()=>setPerson(person === group.name ? null : group.name)} className="flex w-full items-center gap-2 py-3 text-left font-semibold text-sky-800"><ChevronRight size={16} className={person === group.name ? 'rotate-90' : ''}/>{group.name}<span className="ml-auto text-xs font-normal text-slate-500">{group.items.length}개 기록</span></button>
          {person === group.name && <div className="pl-3">{group.items.map(renderItem)}</div>}
        </section>) : items.map(renderItem)}
      </div>
      <footer className="p-5 flex items-center gap-2 border-t border-slate-100">
        <button disabled={busy || data?.running} onClick={() => void mutate('POST', { action: 'refresh' })} className="mr-auto flex items-center gap-1 text-sm text-sky-700 disabled:opacity-50"><RefreshCw size={15} className={busy || data?.running ? 'animate-spin' : ''} />{busy || data?.running ? '요약 중' : '요약 갱신'}</button>
        <button className="px-4 py-2 border border-slate-200 rounded-lg" onClick={() => setEditing(!editing)}>{editing ? '편집 완료' : '편집'}</button>
        <button className="px-4 py-2 bg-sky-600 text-white rounded-lg" onClick={() => setDraft({ kind, title: '', content: '', manual: 1 })}>추가</button>
      </footer>
      {draft && <div className="absolute inset-0 bg-black/20 flex items-center justify-center p-5" onClick={() => !busy && setDraft(null)}><form className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl space-y-3" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); void mutate(draft.id ? 'PATCH' : 'POST', draft); }}>
        <h3 className="font-bold">기억 {draft.id ? '수정' : '추가'}</h3>
        <select aria-label="기억 종류" disabled={draft.manual === 0} value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2">{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <input required maxLength={120} aria-label="기억 제목" placeholder="기억 제목" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} className="w-full rounded-lg border border-slate-200 p-3" />
        <textarea required maxLength={6000} aria-label="기억 내용" placeholder="기억할 내용" rows={8} value={draft.content} onChange={e => setDraft({ ...draft, content: e.target.value })} className="w-full rounded-lg border border-slate-200 p-3" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setDraft(null)} className="px-4 py-2">취소</button><button disabled={busy} className="px-4 py-2 rounded-lg bg-sky-600 text-white">{busy ? '저장 중' : '저장'}</button></div>
      </form></div>}
    </section>
  </div>;
}
