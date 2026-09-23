'use client';
import { readUploadImage } from '@/lib/image-upload';
import { useRef, useState } from 'react';
import type { DescriptionImages } from './DescriptionContent';
export default function DescriptionEditor({ text, images, onChange }: {
  text: string; images: DescriptionImages; onChange: (text: string, images: DescriptionImages) => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef({ text, images, onChange }); latest.current = { text, images, onChange };
  const insert = async (files: File[]) => {
    if (!files.length || busy) return;
    setBusy(true); setError('');
    const start = textarea.current?.selectionStart ?? text.length;
    const end = textarea.current?.selectionEnd ?? start;
    try {
      const loaded = await Promise.all(files.map(async file => {
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('PNG, JPG, WebP, GIF 사진을 선택해 주세요.');
        return {id:crypto.randomUUID(), url:await readUploadImage(file), name:file.name};
      }));
      const current = latest.current;
      const added = loaded.map(image => `\n{{description-image:${image.id}}}\n`).join('');
      const nextImages = { ...current.images };
      loaded.forEach(image => { nextImages[image.id] = { url: image.url, name: image.name }; });
      current.onChange(current.text.slice(0, start) + added + current.text.slice(end), nextImages);
      requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(start + added.length, start + added.length); });
    } catch (e) { setError(e instanceof Error ? e.message : '사진 삽입에 실패했어요.'); }
    finally { setBusy(false); if (picker.current) picker.current.value = ''; }
  };
  const remove = (id: string) => {
    const next = { ...images }; delete next[id];
    onChange(text.split(`{{description-image:${id}}}`).join(''), next);
  };
  return <section className="space-y-2">
    <label htmlFor="story-description" className="text-sm font-semibold">상세 설명</label>
    <p className="text-xs text-slate-500">글을 작성하다가 원하는 위치에 커서를 놓고 사진을 삽입하세요.</p>
    <input ref={picker} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={e => void insert(Array.from(e.target.files || []))} />
    <button type="button" disabled={busy} onClick={() => picker.current?.click()} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800 disabled:opacity-50">{busy ? '사진 넣는 중…' : '+ 사진 삽입'}</button>
    <textarea id="story-description" ref={textarea} disabled={busy} rows={8} value={text} onChange={e => onChange(e.target.value, images)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 focus:outline-none focus:border-sky-500 disabled:opacity-60" placeholder="스토리의 성격, 세계관, 인물과 배경을 소개해 주세요." />
    <p className="text-right text-xs text-slate-400">{text.replace(/\{\{description-image:[a-zA-Z0-9-]+\}\}/g, '').length.toLocaleString()}자 · 글자 수 제한 없음</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {Object.entries(images).length > 0 && <div className="flex flex-wrap gap-3">{Object.entries(images).map(([id, image]) => <div key={id} className="w-24 rounded-lg border border-slate-200 p-1.5"><img src={image.url} alt={image.name} className="h-16 w-full rounded object-cover" /><button type="button" disabled={busy} onClick={() => remove(id)} className="w-full py-1 text-xs text-slate-500">사진 삭제</button></div>)}</div>}
  </section>;
}
