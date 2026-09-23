// components/MediaDetailList.tsx
'use client';
import { imageByteSize, formatImageSize } from '@/lib/media-file-info';
import { readUploadImage } from '@/lib/image-upload';

import { useState, useRef } from 'react';
import { ChevronDown, ChevronUp, Trash2, Copy, Check } from 'lucide-react';
import { MediaItem } from '@/components/MediaTabContent';

interface Props {
  mediaList: MediaItem[];
  setMediaList: React.Dispatch<React.SetStateAction<MediaItem[]>>;
  selectedSettingFilter: string;
  onDelete: (id: string) => void;
}

export default function MediaDetailList({
  mediaList,
  setMediaList,
  selectedSettingFilter,
  onDelete,
}: Props) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [targetReplaceId, setTargetReplaceId] = useState<string | null>(null);

  // 펼치기 / 접기 토글
  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // 힌트/메모 업데이트
  const updateField = (id: string, field: 'hint' | 'memo' | 'title', value: string) => {
    setMediaList((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [field]: value } : m))
    );
  };

  // 이미지 코드 복사
  const handleCopyCode = (id: string, name: string) => {
    const code = `{{img:${name}}}`;
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // 이미지 변경 클릭
  const handleReplaceClick = (id: string) => {
    setTargetReplaceId(id);
    replaceInputRef.current?.click();
  };

  // 이미지 변경 파일 선택 처리
  const handleReplaceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetReplaceId) return;

    const replaceId = targetReplaceId;
    readUploadImage(file).then(url => {
      if (url) {
        setMediaList((prev) =>
          prev.map((m) =>
            m.id === replaceId
              ? { ...m, url, name: file.name, sizeBytes: imageByteSize(url) }
              : m
          )
        );
      }
    }).catch(error => alert(error.message));
    e.target.value = '';
  };

  const filtered = mediaList.filter(
    (m) => (m.targetScope || 'all') === selectedSettingFilter
  );

  return (
    <div className="space-y-4 pt-1">
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        onChange={handleReplaceFile}
        className="hidden"
      />

      {/* 분류 드롭다운 */}
      <div className="space-y-1">
        <label className="text-xs font-bold text-gray-700">분류</label>
        <select className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs text-gray-900 focus:outline-none">
          <option value="all">전체</option>
          <option value="basic">기본</option>
        </select>
      </div>

      {/* 이미지 카드 목록 */}
      {filtered.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-10 text-center text-xs text-gray-500">
          업로드된 이미지가 없습니다. [1. 이미지 업로드]에서 사진을 먼저 추가해 주세요.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item, idx) => {
            const isExpanded = expandedIds[item.id] ?? false;
            const displayName = item.title?.trim() || item.name.replace(/\.[^/.]+$/, '');

            return (
              <div
                key={item.id}
                className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4 shadow-sm transition"
              >
                {/* 상단 헤더 요약행 */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <img loading="lazy"
                      src={item.url}
                      alt={item.name}
                      className="w-14 h-14 rounded-xl object-cover border border-gray-200 bg-black/40 shrink-0"
                    />
                    <div className="space-y-1.5">
                      <h4 className="text-sm font-bold text-gray-900 truncate max-w-[200px]">
                        {displayName || `기본_${idx + 1}`}
                      </h4>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleReplaceClick(item.id)}
                          className="px-2.5 py-1 bg-white hover:bg-gray-200 text-gray-900 text-[11px] whitespace-nowrap font-medium rounded-lg border border-gray-200 transition"
                        >
                          이미지 변경
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyCode(item.id, item.name)}
                          className="px-2.5 py-1 bg-white hover:bg-gray-200 text-gray-600 hover:text-gray-900 text-[11px] whitespace-nowrap font-medium rounded-lg border border-gray-200 transition flex items-center gap-1"
                        >
                          {copiedId === item.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                          {copiedId === item.id ? '복사됨' : '코드 복사'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg hover:bg-white/5 transition"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <span className="text-[11px] text-gray-500 whitespace-nowrap" title="이미지 파일 용량 (최적화 후)">{formatImageSize(imageByteSize(item.url) ?? item.sizeBytes)}</span>
                    <button
                      type="button"
                      onClick={() => toggleExpand(item.id)}
                      className="p-1.5 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-white/5 transition"
                      title={isExpanded ? '접기' : '펼치기'}
                    >
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* 펼쳐졌을 때 나타나는 힌트 & 메모 영역 */}
                {isExpanded && (
                  <div className="space-y-4 pt-3 border-t border-gray-100 animate-fadeIn">
                    <div className="space-y-1">
                      <label htmlFor={`image-title-${item.id}`} className="text-xs font-bold text-gray-700">이미지 제목</label>
                      <input id={`image-title-${item.id}`} type="text" maxLength={200}
                        value={item.title ?? ''} placeholder={item.name.replace(/\.[^/.]+$/, '')}
                        onChange={e => updateField(item.id, 'title', e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-xl p-3 text-xs text-gray-900 focus:outline-none focus:border-[#3679a8]" />
                      <p className="text-[11px] text-gray-500">작품 저장 시 반영됩니다. 원래 파일명과 이미지 코드는 유지됩니다.</p>
                    </div>
                    {/* 이미지 힌트 */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">이미지 호출 조건</label>
                      <p className="text-[11px] text-gray-500">
                        AI가 이 사진을 선택할 상황이나 키워드를 입력하세요.
                      </p>
                      <div className="relative">
                        <textarea
                          rows={2}
                          maxLength={1000}
                          placeholder="예) 기쁠 때, 미소, 웃음. 에리가 기뻐하며 웃는 장면에 사용. 슬프거나 화난 장면은 제외."
                          value={item.hint || ''}
                          onChange={(e) => updateField(item.id, 'hint', e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-xl p-3 text-xs text-gray-900 focus:outline-none focus:border-[#3679a8] resize-none pb-5"
                        />
                        <span className="absolute bottom-2 left-3 text-[10px] text-gray-500 font-mono">
                          {(item.hint || '').length}/1000
                        </span>
                      </div>
                    </div>

                    {/* 이미지 메모 */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">이미지 메모</label>
                      <p className="text-[11px] text-gray-500">
                        AI 이미지 호출에 영향을 주지 않는 참고용 메모입니다
                      </p>
                      <div className="relative">
                        <textarea
                          rows={2}
                          maxLength={500}
                          placeholder="예) 히든 엔딩에서 에리가 기쁨의 눈물을 흘릴 때 쓰는 표정"
                          value={item.memo || ''}
                          onChange={(e) => updateField(item.id, 'memo', e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-xl p-3 text-xs text-gray-900 focus:outline-none focus:border-[#3679a8] resize-none pb-5"
                        />
                        <span className="absolute bottom-2 left-3 text-[10px] text-gray-500 font-mono">
                          {(item.memo || '').length}/500
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
