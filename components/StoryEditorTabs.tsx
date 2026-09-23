// components/StoryEditorTabs.tsx
'use client';

import { useState } from 'react';
import { Plus, Trash2, HelpCircle } from 'lucide-react';

export interface KeywordItem {
  id: string;
  key: string;
  val: string;
  scope: 'all' | 'default' | 'extra1' | 'extra2';
}

export function StatsTab({ stats = [], setStats }: any) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-bold text-gray-700 mb-1">스탯 설정</h3>
        <p className="text-[11px] text-gray-500">스탯을 설정하여 스토리에 생동감을 불어넣어 보세요.</p>
      </div>
      <button
        type="button"
        onClick={() => setStats && setStats([...stats, { name: '호감도', value: '50' }])}
        className="w-full py-3 bg-gray-50 hover:bg-gray-200 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 flex items-center justify-center gap-1.5 transition"
      >
        <Plus className="w-4 h-4" /> 스탯 추가
      </button>
    </div>
  );
}

// 📚 사진 속 키워드북 탭 컴포넌트
export function KeywordTab({ keywords = [], setKeywords }: any) {
  const [activeScope, setActiveScope] = useState<'all' | 'default' | 'extra1' | 'extra2'>('all');

  // 개수 카운트
  const countAll = keywords.length;
  const countDefault = keywords.filter((k: KeywordItem) => k.scope === 'default' || k.scope === 'all').length;
  const countExtra1 = keywords.filter((k: KeywordItem) => k.scope === 'extra1' || k.scope === 'all').length;
  const countExtra2 = keywords.filter((k: KeywordItem) => k.scope === 'extra2' || k.scope === 'all').length;

  const handleAddKeyword = () => {
    const newItem: KeywordItem = {
      id: Date.now().toString(),
      key: '',
      val: '',
      scope: activeScope,
    };
    setKeywords([...keywords, newItem]);
  };

  const handleRemoveKeyword = (id: string) => {
    setKeywords(keywords.filter((k: KeywordItem) => k.id !== id));
  };

  const handleChange = (id: string, field: 'key' | 'val' | 'scope', value: string) => {
    setKeywords(
      keywords.map((k: KeywordItem) => (k.id === id ? { ...k, [field]: value } : k))
    );
  };

  const filtered = keywords.filter((k: KeywordItem) => {
    if (activeScope === 'all') return true;
    return k.scope === 'all' || k.scope === activeScope;
  });

  return (
    <div className="space-y-5">
      {/* 상단 제목 & 설명문구 */}
      <div className="space-y-1.5">
        <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
          키워드북
          <HelpCircle className="w-4 h-4 text-gray-500" />
        </h3>
        <div className="text-xs text-gray-500 leading-relaxed space-y-0.5">
          <p>스토리의 세계관이나 추가 정보를 저장해두는 기능이에요.</p>
          <p>스토리나 사용자 메시지가 특정 키워드를 포함하면, 키워드북에 저장된 정보를 자동으로 불러와요.</p>
        </div>
      </div>

      {/* 👇 사진 속 4개 알약 버튼 (전체, 기본 기본 설정, 추가 설정 1, 추가 설정 2) */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
        <button
          type="button"
          onClick={() => setActiveScope('all')}
          className={`px-4 py-2 rounded-full text-xs font-semibold transition flex items-center gap-1.5 shrink-0 ${
            activeScope === 'all'
              ? 'bg-sky-500 text-white border border-gray-300 shadow-md ring-1 ring-gray-200'
              : 'bg-gray-50 text-gray-500 hover:text-gray-700 border border-transparent'
          }`}
        >
          <span>전체</span>
          <span className="text-[11px] font-mono">{countAll}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveScope('default')}
          className={`px-4 py-2 rounded-full text-xs font-semibold transition flex items-center gap-1.5 shrink-0 ${
            activeScope === 'default'
              ? 'bg-sky-500 text-white border border-gray-300 shadow-md ring-1 ring-gray-200'
              : 'bg-gray-50 text-gray-500 hover:text-gray-700 border border-transparent'
          }`}
        >
          <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded-md">
            기본
          </span>
          <span>기본 설정</span>
          <span className="text-[11px] font-mono">{countDefault}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveScope('extra1')}
          className={`px-4 py-2 rounded-full text-xs font-semibold transition flex items-center gap-1.5 shrink-0 ${
            activeScope === 'extra1'
              ? 'bg-sky-500 text-white border border-gray-300 shadow-md ring-1 ring-gray-200'
              : 'bg-gray-50 text-gray-500 hover:text-gray-700 border border-transparent'
          }`}
        >
          <span>추가 설정 1</span>
          <span className="text-[11px] font-mono">{countExtra1}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveScope('extra2')}
          className={`px-4 py-2 rounded-full text-xs font-semibold transition flex items-center gap-1.5 shrink-0 ${
            activeScope === 'extra2'
              ? 'bg-sky-500 text-white border border-gray-300 shadow-md ring-1 ring-gray-200'
              : 'bg-gray-50 text-gray-500 hover:text-gray-700 border border-transparent'
          }`}
        >
          <span>추가 설정 2</span>
          <span className="text-[11px] font-mono">{countExtra2}</span>
        </button>
      </div>

      {/* 키워드 목록 & 추가 */}
      <div className="space-y-3 pt-2">
        {filtered.length === 0 ? (
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-8 text-center text-xs text-gray-500">
            등록된 키워드가 없습니다. 아래 버튼을 눌러 키워드를 추가해 보세요.
          </div>
        ) : (
          filtered.map((item: KeywordItem) => (
            <div key={item.id} className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <input
                  placeholder="키워드 입력 (예: 빈월현, 마검)"
                  value={item.key}
                  onChange={(e) => handleChange(item.id, 'key', e.target.value)}
                  className="bg-transparent text-sm font-bold text-gray-900 focus:outline-none placeholder-gray-500 flex-1"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveKeyword(item.id)}
                  className="text-gray-500 hover:text-red-400 p-1 rounded transition"
                  title="삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <textarea
                rows={2}
                placeholder="키워드가 등장했을 때 AI에게 전달할 상세 정보/설정"
                value={item.val}
                onChange={(e) => handleChange(item.id, 'val', e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-900 focus:outline-none focus:border-[#3679a8] resize-none"
              />
            </div>
          ))
        )}

        <button
          type="button"
          onClick={handleAddKeyword}
          className="w-full py-3 bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-300 rounded-xl text-xs font-semibold text-gray-600 flex items-center justify-center gap-1.5 transition active:scale-[0.99]"
        >
          <Plus className="w-4 h-4 text-sky-600" /> 키워드 노트 추가
        </button>
      </div>
    </div>
  );
}

export function ShortcutsTab() {
  return (
    <div className="space-y-4 text-center py-8">
      <p className="text-xs text-gray-600 font-bold">단축어 설정</p>
      <p className="text-[11px] text-gray-500">자주 쓰는 행동이나 대사를 단축어로 추가하세요.</p>
    </div>
  );
}

export function EndingTab() {
  return (
    <div className="space-y-4 text-center py-8">
      <p className="text-xs text-gray-600 font-bold">엔딩 설정</p>
      <p className="text-[11px] text-gray-500">스토리의 분기별 엔딩 조건을 설정할 수 있습니다.</p>
    </div>
  );
}
