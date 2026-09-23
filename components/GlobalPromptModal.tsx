'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { emptyGlobalPromptSections, GLOBAL_PROMPT_FIELDS, isGlobalPromptSections, type GlobalPromptSections } from '@/lib/global-prompt-sections';

export default function GlobalPromptModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  const saveRequest = useRef<AbortController | null>(null);
  const [sections, setSections] = useState<GlobalPromptSections>(emptyGlobalPromptSections);
  const [revision, setRevision] = useState('');
  const [legacy, setLegacy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const current = ++generation.current;
    if (!isOpen) { dialog.current?.close(); return; }
    dialog.current?.showModal();
    const controller = new AbortController();
    setLoading(true); setSaving(false); setError(''); setSaved(false);
    setSections(emptyGlobalPromptSections()); setRevision(''); setLegacy(false);
    fetch('/api/global-prompt', { cache: 'no-store', signal: controller.signal })
      .then(async res => {
        const data = await res.json();
        if (!res.ok || !isGlobalPromptSections(data.sections) || typeof data.revision !== 'string') {
          throw new Error(data.error || '공용 프롬프트를 불러오지 못했습니다. 창을 닫은 후 다시 열어 주세요.');
        }
        if (controller.signal.aborted || generation.current !== current) return;
        setSections(data.sections); setRevision(data.revision); setLegacy(data.legacy === true); setLoading(false);
      }).catch(err => {
        if (!controller.signal.aborted && generation.current === current) {
          setError(err instanceof Error ? err.message : '공용 프롬프트를 불러오지 못했습니다. 창을 닫은 후 다시 열어 주세요.');
        }
      });
    return () => {
      ++generation.current;
      controller.abort();
      saveRequest.current?.abort();
      saveRequest.current = null;
    };
  }, [isOpen]);

  async function save() {
    if (!isOpen || loading || saving || saveRequest.current) return;
    const current = generation.current;
    const controller = new AbortController();
    saveRequest.current = controller;
    setSaving(true); setError(''); setSaved(false);
    try {
      const res = await fetch('/api/global-prompt', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections, revision }), signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok || !isGlobalPromptSections(data.sections) || typeof data.revision !== 'string') {
        throw new Error(data.error || '공용 프롬프트를 저장하지 못했습니다. 다시 시도해 주세요.');
      }
      if (controller.signal.aborted || generation.current !== current) return;
      setSections(data.sections); setRevision(data.revision); setLegacy(false); setSaved(true);
    } catch (err: unknown) {
      if (!controller.signal.aborted && generation.current === current) {
        setError(err instanceof Error ? err.message : '공용 프롬프트를 저장하지 못했습니다. 다시 시도해 주세요.');
      }
    } finally {
      if (saveRequest.current === controller) saveRequest.current = null;
      if (!controller.signal.aborted && generation.current === current) setSaving(false);
    }
  }

  const totalCharacters = GLOBAL_PROMPT_FIELDS.reduce((total, field) => total + sections[field.key].length, 0);
  return <dialog aria-labelledby="global-prompt-title" ref={dialog} onCancel={e => { e.preventDefault(); if (!saving) onClose(); }} className="m-auto w-[calc(100%_-_2rem)] max-w-5xl overflow-hidden rounded-2xl bg-white p-0 text-gray-900 shadow-2xl backdrop:bg-black/50">
    <div className="flex max-h-[90dvh] flex-col">
      <div className="shrink-0 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold" id="global-prompt-title">공용 프롬프트</h2>
          <button type="button" aria-label="닫기" disabled={saving} onClick={onClose} className="rounded-lg p-2 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm leading-relaxed text-gray-500">모든 작품의 다음 채팅 답변부터 적용됩니다. 입력한 내용을 필수 → 일반 → 문체·형식 → 기타 순서로 함께 적용합니다. 모두 비워서 저장하면 적용을 해제합니다.</p>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
        {legacy && <p className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-800">기존 공용 프롬프트를 내용 변경 없이 ‘일반’ 칸에 표시했습니다. 필요한 내용을 각 칸으로 옮긴 후 저장해 주세요.</p>}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {GLOBAL_PROMPT_FIELDS.map(field => <div key={field.key} className="min-w-0">
            <label htmlFor={`global-prompt-${field.key}`} className="mb-1 block font-semibold">{field.label}</label>
            <p id={`global-prompt-${field.key}-description`} className="mb-2 min-h-10 text-sm leading-5 text-gray-500">{field.description}</p>
            <textarea id={`global-prompt-${field.key}`} aria-describedby={`global-prompt-${field.key}-description`} disabled={loading || saving} value={sections[field.key]} onChange={e => { setSections(previous => ({ ...previous, [field.key]: e.target.value })); setSaved(false); }} placeholder={loading ? '불러오는 중입니다…' : `${field.label}에 적용할 내용을 입력해 주세요.`} className="block h-64 min-h-48 w-full resize-y rounded-xl border border-gray-200 p-4 text-sm leading-relaxed focus:outline-sky-500 disabled:opacity-60" />
            <p className="mt-1.5 text-right text-xs tabular-nums text-gray-500" aria-label={`${field.label} 글자 수`}>{sections[field.key].length.toLocaleString()}자</p>
          </div>)}
        </div>
      </div>
      <div className="shrink-0 border-t border-gray-100 bg-white px-5 py-4 sm:px-6">
        {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
        {saved && <p role="status" className="mb-3 text-sm text-sky-700">저장했습니다.</p>}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm tabular-nums text-gray-500">총 {totalCharacters.toLocaleString()}자</p>
          <button type="button" disabled={loading || saving} onClick={save} className="rounded-xl bg-sky-600 px-6 py-2.5 font-semibold text-white disabled:opacity-50">{saving ? '저장 중입니다…' : '저장'}</button>
        </div>
      </div>
    </div>
  </dialog>;
}
