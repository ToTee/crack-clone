// components/ShortcutsTabContent.tsx
'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import ShortcutCard from '@/components/ShortcutCard';
import StartSettingPreview from '@/components/StartSettingPreview';
import { StartSettingItem } from '@/components/StartSettingTab';

export interface ShortcutItem {
  id: string;
  name: string;
  desc: string;
  prompt: string;
}

interface Props {
  shortcuts: ShortcutItem[];
  setShortcuts: React.Dispatch<React.SetStateAction<ShortcutItem[]>>;
  startSettings: StartSettingItem[];
  name?: string;
  image?: string;
}

const MAX_SHORTCUTS = 50;

export default function ShortcutsTabContent({
  shortcuts = [],
  setShortcuts,
  startSettings = [],
  name = '',
  image = '',
}: Props) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const handleAdd = () => {
    if (shortcuts.length >= MAX_SHORTCUTS) {
      alert(`작품당 최대 ${MAX_SHORTCUTS}개까지 추가할 수 있습니다.`);
      return;
    }
    const nextNum = shortcuts.length + 1;
    const newId = Date.now().toString();
    const newItem: ShortcutItem = {
      id: newId,
      name: `단축어${nextNum}`,
      desc: '',
      prompt: '',
    };
    setShortcuts((prev) => [...prev, newItem]);
    setExpandedIds((prev) => ({ ...prev, [newId]: true }));
  };

  const handleDelete = (id: string) => {
    setShortcuts((prev) => prev.filter((s) => s.id !== id));
  };

  const handleUpdate = (id: string, field: keyof ShortcutItem, val: string) => {
    setShortcuts((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: val } : s))
    );
  };

  const defaultSetting = startSettings[0] || {
    id: 0,
    label: '기본 설정',
    name: '기본 설정',
    prologue: '',
    situation: '',
    playGuide: '',
    suggestedReplies: [],
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-7 space-y-5">
        
        {/* 상단 안내 */}
        <div className="space-y-1">
          <h3 className="text-base font-bold text-gray-900">단축어 설정</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            자주 쓰는 명령을 단축어로 추가해 빠르게 호출하세요. 작품당 최대 {MAX_SHORTCUTS}개까지 추가할 수 있어요.
          </p>
        </div>

        {/* 단축어 카드 리스트 */}
        <div className="space-y-3 pt-1">
          {shortcuts.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-8 text-center text-xs text-gray-500">
              등록된 단축어가 없습니다. 아래 버튼을 눌러 추가하세요.
            </div>
          ) : (
            shortcuts.map((item, idx) => (
              <ShortcutCard
                key={item.id}
                item={item}
                index={idx}
                isExpanded={expandedIds[item.id] ?? false}
                onToggle={() =>
                  setExpandedIds((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                }
                onDelete={() => handleDelete(item.id)}
                onUpdate={(field, val) => handleUpdate(item.id, field, val)}
              />
            ))
          )}

          {/* + 단축어 추가 버튼 */}
          <button
            type="button"
            onClick={handleAdd}
            disabled={shortcuts.length >= MAX_SHORTCUTS}
            className="w-full py-3.5 bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-300 rounded-2xl text-xs font-bold text-gray-700 flex items-center justify-center gap-1.5 transition active:scale-[0.99] shadow-sm disabled:opacity-40"
          >
            <Plus className="w-4 h-4 text-sky-600" /> 단축어 추가 ({shortcuts.length}/{MAX_SHORTCUTS})
          </button>
        </div>

      </div>

      {/* 우측 실시간 씬 미리보기 */}
      <StartSettingPreview
        currentSetting={defaultSetting}
        image={image}
        name={name}
      />

    </div>
  );
}
