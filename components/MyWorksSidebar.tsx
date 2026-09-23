// components/MyWorksSidebar.tsx
'use client';
import { prefetchCharacterInfo } from '@/lib/character-info-client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Edit, Trash2, Plus, Download, Upload } from 'lucide-react';

export interface Character {
  id: string;
  name: string;
  tagline: string;
  avatar: string;
  tags: string;
  created_at?: string;
  editor_config?: string;
}

interface Props {
  works: Character[];
  onRefresh: () => void;
  onCreate: () => void;
}

export default function MyWorksSidebar({ works = [], onRefresh, onCreate }: Props) {
  const [exportOpen, setExportOpen] = useState(false);
  const [exportId, setExportId] = useState('');
  const selectedExportId = works.some(work => work.id === exportId) ? exportId : works[0]?.id || '';
  const importInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [transferNotice, setTransferNotice] = useState('');
  const [transferError, setTransferError] = useState('');
  async function handleImport(file?: File) {
    if (!file) return;
    setTransferError(''); setTransferNotice('');
    if (file.size > 250 * 1024 * 1024) { setTransferError('250MB 이하의 작품 파일을 선택해 주세요.'); return; }
    setImporting(true);
    try {
      const response = await fetch('/api/characters/transfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: file });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '가져오지 못했습니다.');
      setTransferNotice(`‘${result.name}’ 작품을 새로 가져왔습니다.`); onRefresh();
    } catch (error) { setTransferError(error instanceof Error ? error.message : '가져오지 못했습니다.'); }
    finally { setImporting(false); }
  }
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [filter, setFilter] = useState('전체');
  const [visibility, setVisibility] = useState('all');
  const [sort, setSort] = useState('newest');
  const registration = (work: Character) => {
    try { return JSON.parse(work.editor_config || '{}')?.registration || {}; } catch { return {}; }
  };
  const timestamp = (work: Character) => {
    const value = work.created_at || '';
    const parsed = Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:/.test(value) ? value.replace(' ', 'T') + 'Z' : value);
    if (Number.isFinite(parsed)) return parsed;
    const match = /^char_(\d{13})(?:_|$)/.exec(work.id);
    return match ? Number(match[1]) : 0;
  };
  const visibleWorks = works.filter(work => (filter === '전체' || (work.tags || '').split(',').map(tag => tag.trim()).includes(filter)) && (visibility === 'all' || registration(work).visibility === visibility)).sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'ko');
    const diff = timestamp(a) - timestamp(b);
    return (sort === 'oldest' ? diff : -diff) || a.name.localeCompare(b.name, 'ko');
  });
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`정말로 '${name}' 작품을 삭제하시겠습니까?\n삭제된 작품과 대화 내역은 복구할 수 없습니다.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch('/api/characters/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '삭제하지 못했습니다.');
      onRefresh();
    } catch (error) { alert(error instanceof Error ? error.message : '삭제하지 못했습니다.'); }
    finally { setDeletingId(null); }
  };
  return (
    <main className="min-h-screen bg-white text-gray-900 pb-12">
      <section aria-labelledby="my-works-title" className="mx-auto w-full max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-6">
          <h2 id="my-works-title" className="flex items-center gap-2 text-xl font-bold"><BookOpen className="h-5 w-5 text-sky-600" />내 작품</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!works.length} aria-expanded={exportOpen} onClick={() => setExportOpen(value => !value)} className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold disabled:opacity-40"><Download className="h-4 w-4" />내보내기</button>
            <input ref={importInput} type="file" accept=".json,application/json" aria-label="작품 파일 가져오기" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void handleImport(file); }} />
            <button type="button" disabled={importing} onClick={() => importInput.current?.click()} className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold disabled:opacity-40"><Upload className="h-4 w-4" />{importing ? '가져오는 중…' : '가져오기'}</button>
            <button type="button" onClick={onCreate} className="flex items-center gap-1 rounded-xl bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-700"><Plus className="h-4 w-4" />작품 만들기</button>
          </div>
        </header>
        <div className="p-4 sm:p-6">
          {exportOpen && <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm font-semibold">내보낼 작품
              <select value={selectedExportId} onChange={event => setExportId(event.target.value)} className="min-w-0 rounded-lg border border-gray-200 bg-white p-2 font-normal">{works.map(work => <option key={work.id} value={work.id}>{work.name}</option>)}</select>
            </label>
            {selectedExportId && <a href={`/api/characters/transfer?id=${encodeURIComponent(selectedExportId)}`} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white">파일 저장</a>}
            <button type="button" onClick={() => setExportOpen(false)} className="rounded-lg px-3 py-2 text-sm text-gray-600">닫기</button>
          </div>}
          <p className="mb-4 text-xs leading-5 text-gray-500">내보내기는 작품 설정과 업로드한 이미지를 JSON 파일로 저장합니다. 외부 이미지는 링크로 보관됩니다. 가져오기는 새 작품으로 추가하며, 채팅·개인 설정은 포함하지 않습니다. (가져오기 최대 250MB)</p>
          {transferNotice && <p role="status" className="mb-4 text-sm text-sky-700">{transferNotice}</p>}
          {transferError && <p role="alert" className="mb-4 text-sm text-red-600">{transferError}</p>}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <div className="flex gap-2" aria-label="작품 종류">
              {['전체', '스토리', '캐릭터'].map(type => <button key={type} type="button" aria-pressed={filter === type} onClick={() => setFilter(type)} className={`rounded-full border px-3 py-2 text-sm ${filter === type ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{type}</button>)}
            </div>
            <select aria-label="공개 여부 필터" value={visibility} onChange={event => setVisibility(event.target.value)} className="rounded-full border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
              <option value="all">공개 여부 · 전체</option><option value="public">공개</option><option value="private">비공개</option><option value="link">링크 공개</option>
            </select>
          </div>
          <div className="mb-5 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">전체 {works.length}건{(filter !== '전체' || visibility !== 'all') && <span className="ml-2 font-normal text-gray-500">표시 {visibleWorks.length}건</span>}</p>
            <select aria-label="작품 정렬" value={sort} onChange={event => setSort(event.target.value)} className="rounded-lg bg-white px-2 py-2 text-sm text-gray-500">
              <option value="newest">최신순</option><option value="oldest">오래된순</option><option value="name">이름순</option>
            </select>
          </div>
          {visibleWorks.length === 0 ? <p className="py-20 text-center text-sm text-gray-500">표시할 작품이 없습니다.</p> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
              {visibleWorks.map(work => (
                <article key={work.id} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:border-sky-400 hover:shadow-md">
                  <Link href={`/character/${work.id}`} onPointerEnter={() => prefetchCharacterInfo(work.id)} onFocus={() => prefetchCharacterInfo(work.id)} onTouchStart={() => prefetchCharacterInfo(work.id)} className="block">
                    <div className="aspect-[4/5] overflow-hidden bg-gray-100">
                      <img src={work.avatar} alt={work.name} className="h-full w-full object-contain" />
                    </div>
                    <div className="space-y-1.5 border-t border-gray-100 p-3">
                      <h3 className="line-clamp-2 break-words text-sm font-bold leading-snug group-hover:text-sky-600">{work.name}</h3>
                      <div className="flex flex-wrap gap-1">
                        {registration(work).visibility && <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{({public:'공개',private:'비공개',link:'링크 공개'} as Record<string,string>)[registration(work).visibility]}</span>}
                        {(work.tags || '').split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 3).map((tag, index) => <span key={index} className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700">{tag}</span>)}
                      </div>
                      <p className="line-clamp-1 text-xs leading-relaxed text-gray-500">{work.tagline || '설정된 한 줄 소개가 없습니다.'}</p>
                    </div>
                  </Link>
                  <div className="mt-auto flex flex-wrap items-center justify-end gap-2 px-3 pb-3">
                    <Link href={`/edit/${work.id}`} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-sky-50"><Edit className="h-3.5 w-3.5" />수정</Link>
                    <button type="button" aria-label={`${work.name} 삭제`} title="작품 삭제" disabled={deletingId === work.id} onClick={() => handleDelete(work.id, work.name)} className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
