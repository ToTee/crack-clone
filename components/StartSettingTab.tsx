// components/StartSettingTab.tsx
'use client';

import { useState } from 'react';
import { Plus, Minus, HelpCircle } from 'lucide-react';
import type { ChatMedia } from '@/lib/chat-media';
import StartSettingPreview from '@/components/StartSettingPreview';

export interface StartSettingItem {
  id: number;
  label: string;
  name: string;
  prologue: string;
  situation: string;
  playGuide: string;
  suggestedReplies: string[];
}

interface Props {
  mediaList?: ChatMedia[];
  name?: string;
  image?: string;
  startSettings: StartSettingItem[];
  setStartSettings: (v: StartSettingItem[]) => void;
}

export default function StartSettingTab({
  mediaList = [],
  name = '스토리 인물',
  image = '',
  startSettings = [],
  setStartSettings,
}: Props) {
  const [activeSubIndex, setActiveSubIndex] = useState(0);
  const currentSetting = startSettings[activeSubIndex] || startSettings[0];

  const updateField = (field: keyof StartSettingItem, value: any) => {
    const updated = [...startSettings];
    updated[activeSubIndex] = { ...updated[activeSubIndex], [field]: value };
    setStartSettings(updated);
  };

  const handleAddReply = () => {
    if (currentSetting.suggestedReplies.length >= 3) return;
    updateField('suggestedReplies', [...currentSetting.suggestedReplies, '']);
  };

  const handleRemoveReply = (idx: number) => {
    updateField(
      'suggestedReplies',
      currentSetting.suggestedReplies.filter((_, i) => i !== idx)
    );
  };

  const handleReplyChange = (idx: number, val: string) => {
    const updated = [...currentSetting.suggestedReplies];
    updated[idx] = val;
    updateField('suggestedReplies', updated);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-7 space-y-6">
        
        {/* 시작설정 이름을 실시간으로 표시 */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {startSettings.map((setting, idx) => {
            const isActive = activeSubIndex === idx;
            const tabName = setting.name?.trim() || setting.label;
            return (
              <button
                key={setting.id}
                type="button"
                onClick={() => setActiveSubIndex(idx)}
                title={tabName}
                className={`px-4 py-2 rounded-full text-xs font-semibold transition flex max-w-full items-center gap-1.5 ${
                  isActive
                    ? 'bg-white text-gray-900 border border-gray-300 shadow-md ring-1 ring-gray-200'
                    : 'bg-gray-50 text-gray-500 hover:text-gray-700 border border-transparent'
                }`}
              >
                {idx === 0 && (
                  <span className="shrink-0 text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded-md">
                    기본
                  </span>
                )}
                <span className="truncate">{tabName}</span>
              </button>
            );
          })}
        </div>

        {/* 프롤로그 */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-bold text-gray-700">
                프롤로그 {activeSubIndex === 0 && <span className="text-[#3679a8]">*</span>}
              </label>
              <HelpCircle className="w-3.5 h-3.5 text-gray-500" />
            </div>
            <span className="text-[11px] text-gray-500">
              {currentSetting.prologue.length.toLocaleString()}자
            </span>
          </div>
          <p className="text-[11px] text-gray-500">
            {'스토리의 프롤로그를 작성해 주세요. {{분류}} 또는 {{분류_상황}}으로 업로드한 이미지를 넣을 수 있어요.'}
          </p>
          <textarea
            rows={6}
            placeholder={
              activeSubIndex === 0
                ? `| #1 | 🌍 시골 마을 어귀 | 🌞 노을 진 저녁 | 🟢\n\n풀벌레 소리만이 가득한 한적한 시골길. 저 멀리 안개 속에서 비정상적으로 키가 큰 그림자가 서서히 당신을 향해 걸어오고 있었다.\n\n| 정체불명의 존재 | "드디어... 찾았다..."`
                : `[추가 프롤로그 ${activeSubIndex}] 색다른 시작 상황을 자유롭게 작성해 보세요.`
            }
            value={currentSetting.prologue}
            onChange={(e) => updateField('prologue', e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-xs text-gray-900 focus:outline-none focus:border-[#3679a8] leading-relaxed font-mono"
          />
        </div>

        {/* 시작설정 이름 */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700">
            시작설정 이름 {activeSubIndex === 0 && <span className="text-[#3679a8]">*</span>}
          </label>
          <input
            value={currentSetting.name}
            onChange={(e) => updateField('name', e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs text-gray-900 focus:outline-none focus:border-[#3679a8]"
          />
        </div>

        {/* 시작 상황 */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700">시작 상황</label>
          <textarea
            rows={3}
            placeholder="사용자의 역할, 등장인물과의 관계, 이야기가 시작되는 세계관 등"
            value={currentSetting.situation}
            onChange={(e) => updateField('situation', e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-900 focus:outline-none focus:border-[#3679a8]"
          />
        </div>

        {/* 플레이 가이드 */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700">플레이 가이드</label>
          <p className="text-[11px] text-gray-500">
            AI가 기억하지 않는, 사용자에게만 보이는 가이드 메시지를 추가해 플레이 방법을 안내해 보세요.
          </p>
          <div className="relative">
            <textarea
              rows={3}
              maxLength={500}
              placeholder="사용자를 위한 가이드를 작성해주세요"
              value={currentSetting.playGuide}
              onChange={(e) => updateField('playGuide', e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-900 focus:outline-none focus:border-[#3679a8] resize-none pb-6"
            />
            <span className="absolute bottom-2 left-3 text-[10px] text-gray-500">
              {currentSetting.playGuide.length} / 500
            </span>
          </div>
        </div>

        {/* 추천 답변 */}
        <div className="space-y-2.5 pt-1">
          <div>
            <label className="text-xs font-bold text-gray-700">추천 답변</label>
            <p className="text-[11px] text-gray-500 mt-0.5">
              사용자들에게 첫 답변을 최대 3개 추천해 보세요.
            </p>
          </div>

          <div className="space-y-3">
            {currentSetting.suggestedReplies.map((reply, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div className="relative flex-1">
                  <textarea
                    rows={2}
                    maxLength={200}
                    placeholder={`추천 답변 ${idx + 1}`}
                    value={reply}
                    onChange={(e) => handleReplyChange(idx, e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-900 focus:outline-none focus:border-[#3679a8] resize-none pb-6"
                  />
                  <span className="absolute bottom-2 left-3 text-[10px] text-gray-500">
                    {reply.length} / 200
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveReply(idx)}
                  className="p-2.5 text-gray-500 hover:text-red-400 bg-gray-50 border border-gray-200 rounded-xl transition mt-1"
                  title="삭제"
                >
                  <Minus className="w-4 h-4" />
                </button>
              </div>
            ))}

            {currentSetting.suggestedReplies.length < 3 && (
              <button
                type="button"
                onClick={handleAddReply}
                className="w-full py-3 bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-300 rounded-xl text-xs font-semibold text-gray-600 flex items-center justify-center gap-1.5 transition active:scale-[0.99]"
              >
                <Plus className="w-3.5 h-3.5 text-sky-600" />
                추천 답변 추가 ({currentSetting.suggestedReplies.length}/3)
              </button>
            )}
          </div>
        </div>

      </div>

      {/* 우측 실시간 씬 미리보기 컴포넌트 */}
      <StartSettingPreview mediaList={mediaList} currentSetting={currentSetting} image={image} name={name} />

    </div>
  );
}
