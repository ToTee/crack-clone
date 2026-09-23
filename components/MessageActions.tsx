'use client';

import { useEffect, useRef, useState } from 'react';
import { GitBranch, MoreHorizontal, Pencil, Trash2, RotateCcw } from 'lucide-react';

export type MessageAction = 'branch' | 'edit' | 'delete';

export default function MessageActions({ content, disabled, onAction, onRegenerate }: {
  content: string;
  onRegenerate?: () => Promise<void>;
  disabled: boolean;
  onAction: (action: MessageAction, content?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, []);
  async function run(action: MessageAction) {
    setOpen(false);
    if (action === 'delete' && !window.confirm('이 메시지만 삭제할까요? 이후 메시지는 유지되며, 삭제는 되돌릴 수 없습니다.')) return;
    setBusy(true); setError('');
    try { await onAction(action, action === 'edit' ? draft : undefined); setEditing(false); }
    catch (e) { setError(e instanceof Error ? e.message : '처리하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  return <div ref={root} className="relative mt-3 text-gray-700" style={{ WebkitTextStrokeWidth: 0 }}>
    <div className="flex gap-2 justify-end">
      <button type="button" aria-label="메시지 옵션" aria-haspopup="menu" aria-expanded={open}
        disabled={disabled || busy} onClick={() => setOpen(!open)}
        className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {onRegenerate && <button type="button" aria-label="답변 재생성" title="답변 재생성" disabled={disabled || busy} onClick={async () => { setError(''); setBusy(true); try { await onRegenerate(); } catch (e) { setError(e instanceof Error ? e.message : '재생성하지 못했습니다.'); } finally { setBusy(false); } }} className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40"><RotateCcw className="h-4 w-4" /></button>}
    </div>
    {open && <div role="menu" className="absolute right-0 bottom-full mb-1 z-30 w-32 rounded-xl border border-gray-200 bg-white py-1 shadow-lg text-sm whitespace-normal">
      <button role="menuitem" onClick={() => run('branch')} className="flex w-full items-center gap-2 px-4 py-2 hover:bg-gray-50"><GitBranch className="h-4 w-4" />분기</button>
      <button role="menuitem" onClick={() => { setDraft(content); setEditing(true); setOpen(false); setError(''); }} className="flex w-full items-center gap-2 px-4 py-2 hover:bg-gray-50"><Pencil className="h-4 w-4" />수정</button>
      <button role="menuitem" onClick={() => run('delete')} className="flex w-full items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" />삭제</button>
    </div>}
    {editing && <div className="mt-2 space-y-2 rounded-xl border border-gray-200 bg-white p-3 whitespace-normal">
      <label className="block text-sm font-semibold">메시지 수정
        <textarea aria-label="메시지 수정 내용" autoFocus rows={8} value={draft} disabled={busy || disabled}
          onChange={e => setDraft(e.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-base font-normal text-gray-800" />
      </label>
      <p className="text-xs text-gray-500">선택한 메시지만 수정합니다. 이후 답변은 자동으로 다시 생성되지 않습니다.</p>
      <div className="flex justify-end gap-2 text-sm">
        <button disabled={busy} onClick={() => setEditing(false)} className="rounded-lg border px-3 py-2">취소</button>
        <button disabled={busy || disabled || !draft.trim()} onClick={() => run('edit')} className="rounded-lg bg-sky-600 px-3 py-2 text-white disabled:opacity-40">{busy ? '저장 중…' : '저장'}</button>
      </div>
    </div>}
    {error && <p role="alert" className="mt-2 text-sm text-red-600 whitespace-normal">{error}</p>}
  </div>;
}
