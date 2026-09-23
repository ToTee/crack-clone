// components/KeywordNoteCard.tsx
'use client';

import { useState } from 'react';
import { GripVertical, Edit2, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react';
import { KeywordNoteItem } from '@/components/KeywordTabContent';

interface Props {
  note: KeywordNoteItem;
  dragHandle?: React.ReactNode;
  startSettings?: { id: number; name: string }[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  onUpdate: (field: keyof KeywordNoteItem, value: any) => void;
}

export default function KeywordNoteCard({
  note,
  dragHandle,
  startSettings = [],
  isExpanded,
  onToggleExpand,
  onDelete,
  onUpdate,
}: Props) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const text = inputValue.trim().replace(/,/g, '');
      if (!text) return;
      if (note.keywords.length >= 10) {
        alert('키워드는 최대 10개까지 등록 가능합니다.');
        return;
      }
      if (!note.keywords.includes(text)) {
        onUpdate('keywords', [...note.keywords, text]);
      }
      setInputValue('');
    }
  };

  const removeKeyword = (kw: string) => {
    onUpdate('keywords', note.keywords.filter((t) => t !== kw));
  };

  const toggleTarget = (targetKey: string) => {
    if (targetKey === 'all') {
      onUpdate('appliedTargets', ['default', 'extra1', 'extra2']);
      return;
    }
    if (note.appliedTargets.includes('all') || ['default', 'extra1', 'extra2'].every(t => note.appliedTargets.includes(t))) {
      onUpdate('appliedTargets', [targetKey]);
      return;
    }
    if (note.appliedTargets.includes(targetKey)) {
      if (note.appliedTargets.length === 1) {
        alert('최소 1개 이상의 적용 대상을 선택해야 합니다.');
        return;
      }
      onUpdate('appliedTargets', note.appliedTargets.filter((t) => t !== targetKey));
    } else {
      onUpdate('appliedTargets', [...note.appliedTargets, targetKey]);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm transition">
      {/* 카드 헤더 행 */}
      <div className="p-4 flex items-center justify-between bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2 flex-1 mr-2">
          {dragHandle || <GripVertical className="w-4 h-4 text-gray-500 shrink-0" />}
          {isEditingTitle ? (
            <input
              autoFocus
              value={note.title}
              onChange={(e) => onUpdate('title', e.target.value)}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
              className="bg-white border border-sky-500 rounded px-2 py-0.5 text-xs text-gray-900 focus:outline-none flex-1 max-w-[220px]"
            />
          ) : (
            <span
              onClick={onToggleExpand}
              className="text-xs font-bold text-gray-900 cursor-pointer hover:text-sky-300 transition truncate"
            >
              {note.title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsEditingTitle(!isEditingTitle)}
            className="p-1.5 text-gray-500 hover:text-gray-900 transition rounded"
            title="이름 수정"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 text-gray-500 hover:text-red-400 transition rounded"
            title="삭제"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleExpand}
            className="p-1.5 text-gray-500 hover:text-gray-900 transition rounded"
            title={isExpanded ? '접기' : '펼치기'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 카드 상세 폼 */}
      {isExpanded && (
        <div className="p-5 space-y-5 bg-gray-50 animate-fadeIn">
          
          {/* 1. 정보 (1000자) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700">
              정보 <span className="text-[#3679a8]">*</span>
            </label>
            <p className="text-[11px] text-gray-500">
              스토리가 불러올 추가 정보를 입력해 주세요
            </p>
            <div className="space-y-1">
              <textarea
                rows={4}
                maxLength={1000}
                placeholder={`메이브의 지팡이는 "엘다리스"입니다.\n숲의 정령들과의 교감을 통해 에너지를 충전합니다.`}
                value={note.info}
                onChange={(e) => onUpdate('info', e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-xs text-gray-900 focus:outline-none focus:border-[#3679a8] leading-relaxed resize-none block"
              />
              <span className="block px-1 text-[10px] text-gray-500 font-mono">
                {note.info.length} / 1000
              </span>
            </div>
          </div>

          <label className="block space-y-2 text-xs font-bold text-gray-700">호출 방식
            <select value={note.triggerMode === 'direct' ? 'direct' : 'general'} onChange={e => onUpdate('triggerMode', e.target.value)} className="block w-full rounded-xl border border-gray-200 bg-gray-50 p-3 font-normal">
              <option value="general">일반 검색 · 이름이나 키워드가 언급되면</option>
              <option value="direct">직접 등장 · 사용자 입력 / 대사 인물 / 현재 인물</option>
            </select>
            <span className="block font-normal leading-5 text-gray-500">직접 등장은 이번 입력과 직전 4개 메시지의 사용자 입력·AI 대사 인물, 최신 AI 상태창의 《 인물 》을 확인합니다. 키워드에 이름과 별칭을 등록하세요. 대사 없이 행동만 하는 인물은 놓칠 수 있습니다.</span>
          </label>
          {/* 2. 키워드 (10개) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700">
              키워드 <span className="text-[#3679a8]">*</span>
            </label>
            <p className="text-[11px] text-gray-500">
              정보를 불러올 키워드를 입력해 주세요. 단어 입력 후 엔터를 눌러주세요. (최대 10개)
            </p>

            <div className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
              {note.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {note.keywords.map((kw, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 bg-white border border-gray-300 text-sky-300 text-xs px-2.5 py-1 rounded-lg"
                    >
                      {kw}
                      <button
                        type="button"
                        onClick={() => removeKeyword(kw)}
                        className="text-gray-500 hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between">
                <input
                  placeholder="단어 입력 후 엔터"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="bg-transparent text-xs text-gray-900 placeholder-gray-500 focus:outline-none flex-1"
                />
                <span className="text-[10px] text-gray-500 font-mono shrink-0">
                  {note.keywords.length} / 10
                </span>
              </div>
            </div>
          </div>

          {/* 3. 키워드북 적용 대상 */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700">
              키워드북 적용 대상 <span className="text-[#3679a8]">*</span>
            </label>
            <p className="text-[11px] text-gray-500">
              전체 또는 개별 적용이 가능합니다
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              {[
                { id: 'all', label: '전체' },
                { id: 'default', label: startSettings.find(s => s.id === 0)?.name || '기본 설정' },
                { id: 'extra1', label: startSettings.find(s => s.id === 1)?.name || '추가 설정 1' },
                { id: 'extra2', label: startSettings.find(s => s.id === 2)?.name || '추가 설정 2' },
              ].map((target) => {
                const common = note.appliedTargets.includes('all') || ['default', 'extra1', 'extra2'].every(t => note.appliedTargets.includes(t));
                const isSelected = target.id === 'all' ? common : !common && note.appliedTargets.includes(target.id);
                return (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => toggleTarget(target.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition flex items-center gap-1 ${
                      isSelected
                        ? 'bg-sky-600/20 text-sky-300 border-sky-500/50'
                        : 'bg-gray-50 text-gray-500 border-gray-100 hover:text-gray-700'
                    }`}
                  >
                    <span>{target.label}</span>
                    {isSelected && <span className="text-sky-600 text-[10px]">✕</span>}
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
