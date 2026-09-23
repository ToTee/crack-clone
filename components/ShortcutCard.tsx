// components/ShortcutCard.tsx
'use client';

import { GripVertical, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { ShortcutItem } from '@/components/ShortcutsTabContent';

interface Props {
  item: ShortcutItem;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (field: keyof ShortcutItem, val: string) => void;
}

export default function ShortcutCard({
  item,
  index,
  isExpanded,
  onToggle,
  onDelete,
  onUpdate,
}: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm transition">
      {/* 접힌 헤더 줄 */}
      <div className="p-4 flex items-center justify-between bg-gray-50 border-b border-gray-100">
        <div
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 cursor-pointer select-none"
        >
          <GripVertical className="w-4 h-4 text-gray-500 shrink-0" />
          <span className="text-xs font-bold text-gray-900 hover:text-sky-300 transition">
            {item.name ? `/${item.name}` : `단축어 ${index + 1}`}
          </span>
          {item.desc && (
            <span className="text-[11px] text-gray-500 truncate max-w-[200px]">
              - {item.desc}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 text-gray-500 hover:text-red-400 rounded transition"
            title="삭제"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="p-1.5 text-gray-500 hover:text-gray-900 rounded transition"
            title={isExpanded ? '접기' : '펼치기'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 펼쳐진 세부 폼 (사진 100% 재현) */}
      {isExpanded && (
        <div className="p-5 space-y-4 bg-gray-50 animate-fadeIn">
          
          {/* 1. 단축어 이름 (10자) */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-gray-700">
                단축어 이름 <span className="text-[#3679a8]">*</span>
              </label>
              <span className="text-[11px] text-gray-500 font-mono">
                {item.name.length}/10
              </span>
            </div>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-xs text-gray-500 font-bold">/</span>
              <input
                maxLength={10}
                placeholder="예: 시점전환"
                value={item.name}
                onChange={(e) => onUpdate('name', e.target.value.replace(/\s|\//g, ''))}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-xs text-gray-900 focus:outline-none focus:border-[#3679a8]"
              />
            </div>
          </div>

          {/* 2. 설명 (30자) */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-gray-700">
                설명 <span className="text-[#3679a8]">*</span>
              </label>
              <span className="text-[11px] text-gray-500 font-mono">
                {item.desc.length}/30
              </span>
            </div>
            <input
              maxLength={30}
              placeholder="이 단축어의 용도를 짧게 설명해주세요"
              value={item.desc}
              onChange={(e) => onUpdate('desc', e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 focus:outline-none focus:border-[#3679a8]"
            />
          </div>

          {/* 3. 프롬프트 본문 (2000자) */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-gray-700">
                프롬프트 본문 <span className="text-[#3679a8]">*</span>
              </label>
              <span className="text-[11px] text-gray-500 font-mono">
                {item.prompt.length}자 · 제한 없음
              </span>
            </div>
            <textarea
              rows={4}
              placeholder="이 단축어가 호출되었을 때 자동 주입될 프롬프트"
              value={item.prompt}
              onChange={(e) => onUpdate('prompt', e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-900 focus:outline-none focus:border-[#3679a8] resize-none leading-relaxed"
            />
          </div>

        </div>
      )}
    </div>
  );
}
