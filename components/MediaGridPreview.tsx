// components/MediaGridPreview.tsx
'use client';

import { useState, useEffect } from 'react';
import { mediaMatrix } from '@/lib/media-layout';
import { Search, Trash2 } from 'lucide-react';
import { MediaItem } from '@/components/MediaTabContent';

interface Props {
  mediaList: MediaItem[];
  filteredMedia: MediaItem[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  selectedSettingFilter: string;
  settingName: string;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onDeleteSelected: (ids: string[]) => void;
}

export default function MediaGridPreview({
  mediaList,
  filteredMedia,
  searchQuery,
  setSearchQuery,
  settingName,
  onDelete,
  onClearAll, onDeleteSelected, selectedSettingFilter,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => { setSelectedIds(new Set()); }, [searchQuery, selectedSettingFilter]);
  const selected = filteredMedia.filter(item => selectedIds.has(item.id));
  const allSelected = filteredMedia.length > 0 && selected.length === filteredMedia.length;
  const toggle = (id: string) => setSelectedIds(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const deleteSelected = () => {
    if (!selected.length || !confirm(`선택한 사진 ${selected.length}장을 삭제할까요? 작품을 저장하면 반영됩니다.`)) return;
    onDeleteSelected(selected.map(item => item.id)); setSelectedIds(new Set());
  };
  const matrix = mediaMatrix(filteredMedia);
  // Sort the rendered axes too, including legacy labels with invisible prefixes.
  const sortLabel = (value: string) => value.normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim();
  const compareLabels = (a: string, b: string) => sortLabel(a).localeCompare(sortLabel(b), 'ko', { numeric: true });
  const categories = [...matrix.categories].sort(compareLabels);
  const situations = [...matrix.situations].sort(compareLabels);
  const cells = matrix.cells;
  return (
    <div className="lg:col-span-8 min-w-0 lg:sticky lg:top-20">
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xl space-y-4">
        
        {/* 상단 헤더 및 카운터 */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-2.5">
          <span className="text-xs font-bold text-gray-700">
            이미지 배치표 <span className="text-sky-600 text-[11px] font-mono">{mediaList.length}/2000</span>
          </span>
          <span className="text-[10px] text-gray-500">
            표시 중: {filteredMedia.length}장
          </span>
        </div>

        {/* 검색 및 비우기 */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="분류 또는 상황 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-sky-500"
            />
          </div>
          {mediaList.length > 0 && (
            <button
              type="button"
              onClick={() => { if (confirm(`모든 시작설정의 사진 ${mediaList.length}장을 비울까요? 작품을 저장하면 반영됩니다.`)) { onClearAll(); setSelectedIds(new Set()); } }}
              className="text-[11px] text-gray-500 hover:text-red-400 whitespace-nowrap px-1"
            >
              전체 비우기
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" aria-label="표시된 사진 전체 선택" checked={allSelected} disabled={!filteredMedia.length} onChange={() => setSelectedIds(allSelected ? new Set() : new Set(filteredMedia.map(item => item.id)))} className="h-4 w-4 accent-sky-600" />전체 선택 (표시된 {filteredMedia.length}장)</label>
          <button type="button" onClick={() => setSelectedIds(new Set())} disabled={!selected.length} className="text-gray-500 disabled:opacity-40">선택 해제</button>
          <button type="button" onClick={deleteSelected} disabled={!selected.length} className="ml-auto rounded-lg bg-red-50 px-3 py-2 font-semibold text-red-600 disabled:opacity-40">선택 삭제 ({selected.length})</button>
        </div>
        {/* 필터 뱃지 */}
        <div className="text-center">
          <span className="bg-sky-500 text-white text-[11px] font-bold px-4 py-1 rounded-full border border-gray-200 inline-block shadow-sm">
            {settingName} 이미지
          </span>
        </div>

        {/* 분류는 열, 상황은 행으로 배치 */}
        <div tabIndex={0} role="region" aria-label="분류와 상황별 이미지 배치표" className="isolate rounded-xl border border-gray-100 min-h-[220px] max-h-[560px] overflow-auto">
          {filteredMedia.length === 0 ? (
            <div className="text-center py-14 text-xs text-gray-500">
              {searchQuery.trim() ? '검색 결과가 없습니다.' : '등록된 상황 이미지가 없습니다.'}
            </div>
          ) : (
            <table className="border-separate border-spacing-3 text-xs">
              <caption className="sr-only">분류별 상황 이미지</caption>
              <thead>
                <tr>
                  <th className="min-w-20"><span className="sr-only">상황 / 분류</span></th>
                  {categories.map(category => {
                    const columnIds = Array.from(cells.get(category)?.values() || []).flat().map(item => item.id);
                    const selectedCount = columnIds.filter(id => selectedIds.has(id)).length;
                    const columnSelected = columnIds.length > 0 && selectedCount === columnIds.length;
                    const partlySelected = selectedCount > 0 && !columnSelected;
                    return (
                      <th key={category} scope="col" className="sticky top-0 z-20 min-w-28 max-w-36 bg-white pb-1">
                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-full bg-[#3679a8] px-3 py-2.5 font-semibold text-white" title={`${category}: 표시된 사진 ${columnIds.length}장 선택/해제`}>
                          <span className="min-w-0 break-words">{category}</span>
                          <input type="checkbox" aria-label={`${category} 열의 표시된 사진 ${columnIds.length}장 전체 선택`}
                            checked={columnSelected} aria-checked={partlySelected ? 'mixed' : columnSelected}
                            ref={node => { if (node) node.indeterminate = partlySelected; }}
                            onChange={() => setSelectedIds(previous => {
                              const next = new Set(previous);
                              const remove = columnIds.every(id => previous.has(id));
                              columnIds.forEach(id => { if (remove) next.delete(id); else next.add(id); });
                              return next;
                            })}
                            className="h-4 w-4 shrink-0 accent-sky-600" />
                        </label>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {situations.map(situation => (
                  <tr key={situation}>
                    <th scope="row" className="sticky left-0 z-10 min-w-20 max-w-28 rounded-2xl bg-gray-50 px-3 py-5 font-medium break-words">{situation}</th>
                    {categories.map(category => {
                      const images = cells.get(category)?.get(situation) || [];
                      return (
                        <td key={category} className="min-w-28 max-w-36 align-top">
                          {images.length ? <div className="space-y-2">{images.map(item => (
                            <div key={item.id} className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
                              <label className="absolute left-1 top-1 z-10 flex p-1.5"><input type="checkbox" aria-label={`${item.name} 선택`} checked={selectedIds.has(item.id)} onChange={() => toggle(item.id)} className="h-4 w-4 accent-sky-600" /></label>
                              <img src={item.url} alt={`${category} · ${situation}`} title={item.name} loading="lazy" className="aspect-square w-28 sm:w-32 object-cover" />
                              <button type="button" onClick={() => onDelete(item.id)} aria-label={`${item.name} 삭제`} title="삭제"
                                className="absolute right-1 top-1 rounded-md bg-white/90 p-1.5 text-gray-500 hover:text-red-500 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}</div> : <div className="flex aspect-square w-28 sm:w-32 items-center justify-center rounded-2xl border border-dashed border-gray-200 text-gray-300" aria-label="등록된 이미지 없음">—</div>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}
