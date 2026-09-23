'use client';
import { useEffect, useRef, useState } from 'react';
import { X, Plus, GripVertical } from 'lucide-react';
import { filterShortcuts, type ChatShortcut } from '@/lib/shortcuts';

export default function ShortcutsModal({ items, onClose, onReload, characterId }: { characterId?: string; items: ChatShortcut[]; onClose: () => void; onReload: () => Promise<void> }) {
  const [draft, setDraft] = useState<Partial<ChatShortcut> | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const panelRef = useRef<HTMLElement>(null);
  const drag = useRef<{ id: string; x: number; y: number; startY: number; moved: boolean; before: string | null; inside: boolean } | null>(null);
  const frame = useRef<number | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropBefore, setDropBefore] = useState<string | null>(null);
  const stopDrag = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    drag.current = null;
    setDragId(null); setDropBefore(null);
  };
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  const trackDrag = () => {
    const active = drag.current, panel = panelRef.current;
    if (!active || !panel) return;
    const bounds = panel.getBoundingClientRect();
    active.inside = active.x >= bounds.left && active.x <= bounds.right && active.y >= bounds.top && active.y <= bounds.bottom;
    if (active.moved && active.inside) {
      const top = bounds.top + 80, bottom = bounds.bottom - 55;
      if (active.y < top) panel.scrollTop -= Math.min(16, (top - active.y) / 3);
      else if (active.y > bottom) panel.scrollTop += Math.min(16, (active.y - bottom) / 3);
      const rows = Array.from(panel.querySelectorAll<HTMLElement>('[data-shortcut-id]'));
      const next = rows.find(row => row.dataset.shortcutId !== active.id && active.y < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
      active.before = next?.dataset.shortcutId || null;
      setDropBefore(active.before);
    }
    frame.current = requestAnimationFrame(trackDrag);
  };
  const startDrag = (event: React.PointerEvent<HTMLButtonElement>, id: string) => {
    if (busy || query.trim() || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id, x: event.clientX, y: event.clientY, startY: event.clientY, moved: false, before: null, inside: true };
    setDragId(id); trackDrag();
  };
  const finishDrag = () => {
    const active = drag.current;
    if (active?.moved && active.inside) {
      const ids = items.map(item => item.id).filter(id => id !== active.id);
      const index = active.before ? ids.indexOf(active.before) : ids.length;
      ids.splice(index < 0 ? ids.length : index, 0, active.id);
      if (ids.some((id, i) => id !== items[i]?.id)) void save('PATCH', { mode: 'reorder', characterId, ids, previousIds: items.map(item => item.id) });
    }
    stopDrag();
  };
  const save = async (method: string, body: object) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/shortcuts', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장하지 못했습니다.');
      setDraft(null);
      await onReload();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  const move = async (id: string, direction: number) => {
    const index = items.findIndex(item => item.id === id);
    const next = index + direction;
    if (busy || index < 0 || next < 0 || next >= items.length) return;
    const ids = items.map(item => item.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    await save('PATCH', { mode: 'reorder', characterId, ids, previousIds: items.map(item => item.id) });
  };
  return <div className="fixed inset-0 z-[80] bg-black/30 flex items-center justify-center p-4">
    <section ref={panelRef} role="dialog" aria-modal="true" aria-label="단축어 관리" className="bg-white text-slate-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto p-5 space-y-4">
      <header className="sticky top-0 z-10 bg-white flex items-center justify-between gap-3 py-2"><h2 className="font-bold text-lg">{draft ? draft.id ? '단축어 수정' : '단축어 추가' : '단축어'}</h2><div className="flex items-center gap-3 shrink-0">{!draft && (<button className="flex items-center justify-center gap-1 bg-sky-600 text-white rounded-lg px-3 py-2 text-sm whitespace-nowrap" onClick={() => { setError(''); setDraft({ name:'',desc:'',prompt:'',source:'personal' }); }}><Plus size={16} />단축어 추가</button>)}<button aria-label="닫기" disabled={busy} onClick={onClose}><X size={20} /></button></div></header>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {draft ? <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(draft.id ? 'PATCH' : 'POST', draft); }}>
        <label className="block text-sm font-semibold">단축어 이름<input required value={draft.name || ''} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="예: 시점전환" className="mt-2 w-full border border-slate-200 rounded-xl p-3 font-normal" /></label>
        <label className="block text-sm font-semibold">설명<input value={draft.desc || ''} onChange={e => setDraft({ ...draft, desc: e.target.value })} placeholder="이 단축어의 용도" className="mt-2 w-full border border-slate-200 rounded-xl p-3 font-normal" /></label>
        <label className="block text-sm font-semibold">프롬프트 본문<textarea required rows={9} value={draft.prompt || ''} onChange={e => setDraft({ ...draft, prompt: e.target.value })} placeholder="단축어를 선택했을 때 AI에게 전달할 지시" className="mt-2 w-full border border-slate-200 rounded-xl p-3 font-normal" /></label>
        <p className="text-right text-xs text-slate-500">{(draft.prompt || '').length.toLocaleString()}자 · 글자 수 제한 없음</p>
        <p className="text-xs text-slate-500">내 단축어는 NAS에 저장되어 모든 채팅방과 기기에서 사용할 수 있습니다.</p>
        <footer className="flex justify-end gap-2"><button type="button" disabled={busy} className="px-4 py-2" onClick={() => setDraft(null)}>취소</button><button disabled={busy} className="rounded-lg bg-sky-600 text-white px-4 py-2">{busy ? '저장 중…' : '저장'}</button></footer>
      </form> : <>
        <input aria-label="단축어 검색" placeholder="이름 또는 설명 검색" value={query} onChange={e => setQuery(e.target.value)} className="border border-slate-200 rounded-xl p-3 w-full" />
        {query.trim() && <p className="text-xs text-slate-500">순서를 바꾸려면 검색어를 지워 주세요.</p>}
        <div className="divide-y divide-slate-100">{filterShortcuts(items,query).map(item => <div key={item.id} data-shortcut-id={item.id} className={`relative py-3 pl-9 space-y-2 ${dragId === item.id ? 'opacity-40 bg-sky-50' : ''} ${dragId && dropBefore === item.id ? 'border-t-2 border-t-sky-500' : ''}`}>
          <button className="w-full text-left" onClick={() => setDraft(item.source === 'personal' ? { ...item } : { name: item.name, desc: item.desc, prompt: item.prompt, source: 'personal' })}><b>/{item.name}</b><span className="ml-2 text-xs text-sky-600">{item.source === 'personal' ? '내 단축어' : '제작자 · 내 단축어로 복사'}</span><p className="text-sm text-slate-500">{item.desc}</p></button>
          <button type="button" aria-label={`${item.name} 순서 이동`} title="드래그하여 이동 · 키보드 ↑↓ 이동" disabled={busy || !!query.trim()} onPointerDown={event => startDrag(event, item.id)} onPointerMove={event => { const active = drag.current; if (active) { active.x = event.clientX; active.y = event.clientY; active.moved ||= Math.abs(active.y - active.startY) > 5; } }} onPointerUp={finishDrag} onPointerCancel={stopDrag} onLostPointerCapture={() => { if (drag.current) stopDrag(); }} onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); void move(item.id, event.key === 'ArrowUp' ? -1 : 1); } else if (event.key === 'Escape') stopDrag(); }} style={{ touchAction: 'none' }} className="absolute left-0 top-3 p-1.5 text-slate-400 cursor-grab active:cursor-grabbing disabled:opacity-30"><GripVertical size={20} /></button>
          {item.source === 'personal' && <button disabled={busy} onClick={() => { if (confirm(`/${item.name} 단축어를 삭제하시겠습니까?`)) void save('DELETE', { id: item.id, revision: item.revision }); }} className="text-xs text-red-600">삭제</button>}
        </div>)}</div>
        {dragId && !dropBefore && <div className="h-0.5 bg-sky-500" />}
        {!filterShortcuts(items,query).length && <p className="text-sm text-slate-500 py-6 text-center">일치하는 단축어가 없습니다.</p>}
      </>}
    </section>
  </div>;
}
