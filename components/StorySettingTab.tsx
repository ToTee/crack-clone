// components/StorySettingTab.tsx
'use client';

import { useState } from 'react';
import { ChevronDown, Check, Wand2, User, Smile, Plus, Trash2, Loader2, Sparkles } from 'lucide-react';

import { PROMPT_TEMPLATES as TEMPLATES, getPromptTemplate, combineStoryPrompts } from '@/lib/prompt-templates';

export interface ExampleItem {
  id: string;
  user: string;
  assistant: string;
}

interface Props {
  name?: string;
  tagline?: string;
  promptTemplate: string;
  setPromptTemplate: (v: string) => void;
  storyPrompt: string;
  setStoryPrompt: (v: string) => void;
  peoplePrompt: string;
  setPeoplePrompt: (v: string) => void;
  placesPrompt: string;
  setPlacesPrompt: (v: string) => void;
  examples: ExampleItem[];
  setExamples: (v: ExampleItem[]) => void;
}

export default function StorySettingTab({
  name = '',
  tagline = '',
  promptTemplate,
  setPromptTemplate,
  storyPrompt,
  setStoryPrompt,
  peoplePrompt, setPeoplePrompt, placesPrompt, setPlacesPrompt,
  examples = [],
  setExamples,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const selected = getPromptTemplate(promptTemplate);

  const handleAddExample = () => {
    if (examples.length >= 3) {
      alert('예시는 최대 3개까지 등록할 수 있어요.');
      return;
    }
    setExamples([
      ...examples,
      { id: Date.now().toString(), user: '', assistant: '' },
    ]);
  };

  const handleRemoveExample = (id: string) => {
    setExamples(examples.filter((ex) => ex.id !== id));
  };

  const handleExampleChange = (id: string, field: 'user' | 'assistant', value: string) => {
    setExamples(
      examples.map((ex) => (ex.id === id ? { ...ex, [field]: value } : ex))
    );
  };

  const handleAutoGenerateExamples = async () => {
    if (isGenerating) return;
    setIsGenerating(true);

    try {
      const res = await fetch('/api/generate-examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, tagline, prompt: combineStoryPrompts(storyPrompt, peoplePrompt, placesPrompt), template: selected.id }),
      });

      const data = await res.json();
      if (data.examples && Array.isArray(data.examples)) {
        const formatted = data.examples.slice(0, 3).map((item: any, idx: number) => ({
          id: (Date.now() + idx).toString(),
          user: item.user,
          assistant: item.assistant,
        }));
        setExamples(formatted);
      } else {
        alert('예시 생성 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (e: any) {
      alert('오류 발생: ' + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-7">
      {/* 1. 프롬프트 템플릿 드롭다운 */}
      <div className="space-y-1.5 relative">
        <label className="text-xs font-bold text-gray-700 block">
          프롬프트 템플릿 <span className="text-[#3679a8]">*</span>
        </label>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          스토리의 목적에 맞는 템플릿을 선택해 주세요.<br />
          템플릿을 변경해도 입력하신 내용이 사라지지 않아요.
        </p>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full mt-2 bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl p-3 text-left flex items-center justify-between transition focus:outline-none"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">{selected.icon}</span>
            <span className="text-xs font-bold text-gray-900">{selected.title}</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute top-[100%] left-0 right-0 mt-1.5 bg-gray-50 border border-gray-300 rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-gray-100 animate-fadeIn">
            {TEMPLATES.map((tmpl) => {
              const isCurrent = tmpl.title === selected.title;
              return (
                <div
                  key={tmpl.id}
                  onClick={() => {
                    setPromptTemplate(tmpl.id);
                    setIsOpen(false);
                  }}
                  className={`p-3.5 cursor-pointer transition flex items-start justify-between ${isCurrent ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{tmpl.icon}</span>
                      <span className="text-xs font-bold text-gray-900">{tmpl.title}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 pl-5 leading-tight">{tmpl.desc}</p>
                  </div>
                  {isCurrent && <Check className="w-4 h-4 text-[#3679a8] shrink-0 mt-0.5" />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <details className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-gray-700">
        <summary className="cursor-pointer font-semibold text-sky-700">선택한 템플릿의 AI 지침 보기</summary>
        <p className="mt-2 whitespace-pre-wrap leading-relaxed">{selected.instruction || '자동 템플릿 지침을 추가하지 않습니다. 아래에 입력한 프롬프트와 해당 채팅의 설정을 사용합니다.'}</p>
      </details>

      {/* 2. 프롬프트: 가져온 긴 설정도 편집할 수 있도록 입력 제한 없음 */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <label className="text-xs font-bold text-gray-700">
            일반 프롬프트 <span className="text-[#3679a8]">*</span>
          </label>
          <span className="text-[11px] text-gray-500 font-mono">{storyPrompt.length.toLocaleString('ko-KR')}자</span>
        </div>
        <p className="text-[11px] text-gray-500">일반·인물·장소 프롬프트는 모든 시작설정에 함께 적용됩니다. 일반 칸에는 세계관, 진행 규칙과 문체를 입력하세요.</p>
        <textarea
          rows={9}
          placeholder="AI에게 지시할 역할, 말투, 행동, 세계관, 답변 형식 등을 자유롭게 입력해 주세요."
          value={storyPrompt}
          onChange={(e) => setStoryPrompt(e.target.value)}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-xs text-gray-900 focus:outline-none focus:border-[#3679a8] leading-relaxed font-mono"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setStoryPrompt(
                `당신은 다크 판타지 미스터리 소설 작가입니다.\n\n[세계관 및 주요 인물]\n- 배경: 외딴 시골 마을 '빈월현'.\n- 주요 인물: 정해연 (20세, 음침하지만 다정한 소꿉친구).\n- 대사는 반드시 | 인물명 | "대사" 형식으로 출력하세요.`
              );
            }}
            className="text-xs text-[#3679a8] font-semibold flex items-center gap-1 hover:underline"
          >
            <Wand2 className="w-3.5 h-3.5" /> 예시 불러오기
          </button>
        </div>
      </div>

      {[
        { id: 'people-prompt', title: '인물 프롬프트', value: peoplePrompt, set: setPeoplePrompt, hint: '인물별 이름, 외형, 성격, 말투, 관계와 배경을 입력하세요.' },
        { id: 'places-prompt', title: '장소 프롬프트', value: placesPrompt, set: setPlacesPrompt, hint: '장소별 이름, 구조, 분위기, 특징과 출입 조건을 입력하세요.' },
      ].map(field => <div key={field.id} className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor={field.id} className="text-xs font-bold text-gray-700">{field.title}</label>
          <span className="text-[11px] text-gray-500 font-mono">{field.value.length.toLocaleString('ko-KR')}자</span>
        </div>
        <textarea id={field.id} rows={9} value={field.value} onChange={e => field.set(e.target.value)} placeholder={field.hint} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-xs text-gray-900 focus:outline-none focus:border-[#3679a8] leading-relaxed font-mono" />
      </div>)}

      {/* 3. 전개 예시 영역 */}
      <div className="space-y-3 pt-2">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xs font-bold text-gray-700">전개 예시</h3>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
              전개 예시를 입력해서 스토리의 완성도를 높여보세요.<br />
              예시는 3개까지 등록할 수 있어요.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAutoGenerateExamples}
              disabled={isGenerating}
              className="px-3 py-1.5 bg-[#3679a8]/15 hover:bg-[#3679a8]/25 border border-[#3679a8]/30 text-[#3679a8] rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {isGenerating ? '생성 중...' : '전체 자동 생성'}
            </button>
            <button
              type="button"
              onClick={handleAddExample}
              disabled={examples.length >= 3}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition disabled:opacity-40"
            >
              예시 추가
            </button>
          </div>
        </div>

        {/* 예시 카드 목록 */}
        <div className="space-y-4 pt-1">
          {examples.length === 0 && (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-6 text-center text-xs text-gray-500">
              등록된 전개 예시가 없습니다. [전체 자동 생성] 또는 [예시 추가]를 눌러보세요.
            </div>
          )}

          {examples.map((ex, index) => (
            <div key={ex.id} className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <span className="text-xs font-bold text-gray-900">예시 {index + 1}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveExample(ex.id)}
                  className="text-xs text-gray-500 hover:text-red-400 transition"
                >
                  삭제
                </button>
              </div>

              {/* 사용자({{user}}) 입력칸 */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-gray-600 font-medium">
                  <User className="w-3.5 h-3.5 text-gray-500" />
                  <span>{'{{user}}'} (사용자)</span>
                </div>
                <div className="relative">
                  <textarea
                    rows={2}
                    maxLength={500}
                    placeholder="사용자의 행동이나 대사 입력 (예: 구원자와 함께 어려운 상황에 처한 {{user}})"
                    value={ex.user}
                    onChange={(e) => handleExampleChange(ex.id, 'user', e.target.value)}
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl p-3 text-xs text-gray-900 focus:outline-none focus:border-[#3679a8] resize-none pb-6"
                  />
                  <span className="absolute bottom-2 left-3 text-[10px] text-gray-500">
                    {ex.user.length} / 500
                  </span>
                </div>
              </div>

              {/* 인물/AI 응답 입력칸 */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-gray-600 font-medium">
                  <Smile className="w-3.5 h-3.5 text-sky-600" />
                  <span>{name || '스토리 인물'}</span>
                </div>
                <div className="relative">
                  <textarea
                    rows={3}
                    maxLength={500}
                    placeholder="*행동이나 표정 묘사* &quot;대사 내용&quot;"
                    value={ex.assistant}
                    onChange={(e) => handleExampleChange(ex.id, 'assistant', e.target.value)}
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl p-3 text-xs text-gray-900 focus:outline-none focus:border-[#3679a8] resize-none pb-6"
                  />
                  <span className="absolute bottom-2 left-3 text-[10px] text-gray-500">
                    {ex.assistant.length} / 500
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
