// app/create/page.tsx
'use client';
import { pendingImages } from '@/lib/image-upload';
import ImageUploadStatus from '@/components/ImageUploadStatus';
import MarkdownGuideModal from '@/components/MarkdownGuideModal';

import { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getPromptTemplate, parseEditorConfig, combineStoryPrompts } from '@/lib/prompt-templates';
import { ChevronLeft, Info } from 'lucide-react';
import { defaultRegistration } from '@/components/RegistrationFields';
import ProfileLivePreview from '@/components/ProfileLivePreview';
import ProfileTab from '@/components/ProfileTab';
import StorySettingTab from '@/components/StorySettingTab';
import StartSettingTab, { StartSettingItem } from '@/components/StartSettingTab';
import MediaTabContent, { MediaItem } from '@/components/MediaTabContent';
import KeywordTabContent, { KeywordNoteItem } from '@/components/KeywordTabContent';
import ShortcutsTabContent, { ShortcutItem } from '@/components/ShortcutsTabContent';
import { StatsTab, EndingTab } from '@/components/StoryEditorTabs';


const TABS = [
  { id: 'profile', name: '프로필', required: true },
  { id: 'story_setting', name: '스토리 설정', required: true },
  { id: 'start_setting', name: '시작 설정', required: true },
  { id: 'stats', name: '스탯 설정', required: false },
  { id: 'media', name: '미디어', required: false },
  { id: 'keyword_book', name: '키워드북', required: false },
  { id: 'shortcuts', name: '단축어', required: false },
  { id: 'ending', name: '엔딩 설정', required: false },
];

const INITIAL_START_SETTINGS: StartSettingItem[] = [
  { id: 0, label: '기본 설정', name: '기본 설정', prologue: '', situation: '', playGuide: '', suggestedReplies: [] },
  { id: 1, label: '추가 설정 1', name: '추가 설정 1', prologue: '', situation: '', playGuide: '', suggestedReplies: [] },
  { id: 2, label: '추가 설정 2', name: '추가 설정 2', prologue: '', situation: '', playGuide: '', suggestedReplies: [] },
];

function StoryEditorContent() {
  const router = useRouter();
  const [currentTab, setCurrentTab] = useState('profile');
  const [markdownGuideOpen, setMarkdownGuideOpen] = useState(false);

  // 1. 프로필
  const [image, setImage] = useState('');
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [registration, setRegistration] = useState(defaultRegistration);

  // 2. 스토리 설정
  const [promptTemplate, setPromptTemplate] = useState('default');
  const [storyPrompt, setStoryPrompt] = useState('');
  const [peoplePrompt, setPeoplePrompt] = useState('');
  const [placesPrompt, setPlacesPrompt] = useState('');
  const [examples, setExamples] = useState<any[]>([]);

  // 3. 시작 설정
  const [startSettings, setStartSettings] = useState<StartSettingItem[]>(INITIAL_START_SETTINGS);

  // 4. 미디어 탭
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);

  // 5. 키워드북 탭
  const [keywords, setKeywords] = useState<KeywordNoteItem[]>([]);

  // 6. 단축어 탭
  const [shortcuts, setShortcuts] = useState<ShortcutItem[]>([]);

  // 7. 스탯 탭
  const [stats, setStats] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRegister = async () => {
    if (pendingImages()) { alert('사진 처리가 완료된 후 저장해 주세요.'); return; }
    if (!name.trim()) {
      alert('프로필 탭에서 스토리 이름을 입력해 주세요.');
      setCurrentTab('profile');
      return;
    }
    if (!storyPrompt.trim()) {
      alert('스토리 설정 탭에서 프롬프트를 입력해 주세요.');
      setCurrentTab('story_setting');
      return;
    }
    const defaultSetting = startSettings[0];
    if (!defaultSetting.prologue.trim()) {
      alert('시작 설정 탭의 [기본 설정]에서 프롤로그를 입력해 주세요.');
      setCurrentTab('start_setting');
      return;
    }

    setIsSubmitting(true);

    const examplesPrompt = examples.length > 0
      ? `\n\n[대화 및 서술 전개 예시]\n${examples.map((ex, i) => `<예시 ${i + 1}>\n유저: ${ex.user}\n답변: ${ex.assistant}`).join('\n\n')}`
      : '';

    const extraSettingsPrompt = startSettings.slice(1).filter(s => s.prologue.trim()).map(s => `[${s.label}: ${s.name}]\n프롤로그: ${s.prologue}\n상황: ${s.situation}`).join('\n\n');

    const shortcutsPrompt = shortcuts.length > 0
      ? `\n\n[등록된 단축어 목록]\n${shortcuts.map(s => `/${s.name} (${s.desc}): ${s.prompt}`).join('\n')}`
      : '';

    // 미디어 컷씬 지침


    const combinedSystemPrompt = `
[제작자 프롬프트]
${combineStoryPrompts(storyPrompt, peoplePrompt, placesPrompt)}

[기본 시작 상황]
${defaultSetting.situation || ''}
${defaultSetting.playGuide ? `\n[플레이어 가이드]\n${defaultSetting.playGuide}` : ''}
${extraSettingsPrompt ? `\n\n[선택 가능한 추가 분기 설정]\n${extraSettingsPrompt}` : ''}
${shortcutsPrompt}
${examplesPrompt}
    `.trim();

    try {
      const res = await fetch('/api/characters/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          tagline,
          avatar: image || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
          system_prompt: combinedSystemPrompt,
          editor_config: { version: 1, template: getPromptTemplate(promptTemplate).id, prompt: storyPrompt, peoplePrompt, placesPrompt, examples, keywords, shortcuts, registration, stats },
          first_message: defaultSetting.prologue,
          tags: ['스토리', registration.genre, ...registration.hashtags].filter(Boolean).join(','),
          start_settings: startSettings,
          media_list: mediaList,
        }),
      });

      const data = await res.json();
      if (data.success) {

        // 💾 대용량 IndexedDB에 미디어 저장 (용량 초과 에러 방지!)

        router.push(`/character/${data.id}`);
      } else {
        alert('등록 실패: ' + data.error);
      }
    } catch (e: any) {
      alert('오류 발생: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 flex justify-center pb-24">
      <ImageUploadStatus />
      <div className="w-full max-w-7xl bg-white border-x border-gray-200 min-h-screen flex flex-col shadow-2xl">
        
        {/* 상단 헤더 */}
        <header className="px-5 py-3.5 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white backdrop-blur-md z-30">
          <div className="flex items-center gap-2">
            <Link href="/" className="p-1 text-gray-500 hover:text-gray-900 rounded-lg">
              <ChevronLeft className="w-6 h-6" />
            </Link>
            <h1 className="text-base font-bold text-gray-900 flex items-center gap-1">
              스토리 만들기
              <Info className="w-3.5 h-3.5 text-gray-500" />
            </h1>
          </div>

          <button
            type="button"
            onClick={handleRegister}
            disabled={isSubmitting}
            className="px-4 py-1.5 bg-[#3679a8] hover:bg-[#28638e] disabled:opacity-50 text-white rounded-lg text-xs font-bold transition shadow"
          >
            {isSubmitting ? '등록 중...' : '등록하기'}
          </button>
        </header>

        {/* 탭 네비게이션 */}
        <div className="flex items-center overflow-x-auto border-b border-gray-200 px-4 no-scrollbar text-xs font-medium bg-white">
          {TABS.map((tab) => {
            const isActive = currentTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setCurrentTab(tab.id)}
                className={`py-3 px-3.5 whitespace-nowrap border-b-2 transition flex items-center gap-0.5 shrink-0 ${
                  isActive
                    ? 'border-[#3679a8] text-gray-900 font-bold'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.name}
                {tab.required && <span className="text-[#3679a8] ml-0.5">*</span>}
              </button>
            );
          })}
          <button type="button" onClick={() => setMarkdownGuideOpen(true)} className="py-3 px-3.5 whitespace-nowrap border-b-2 border-transparent text-sky-700 hover:bg-sky-50 transition shrink-0">마크다운 가이드</button>
        </div>
        {markdownGuideOpen && <MarkdownGuideModal onClose={() => setMarkdownGuideOpen(false)} />}

        {/* 탭별 본문 */}
        <main className="flex-1 p-5 sm:p-6 space-y-6">
          {currentTab === 'profile' && (
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="min-w-0"><ProfileTab
              registration={registration}
              setRegistration={setRegistration}
              image={image}
              setImage={setImage}
              name={name}
              setName={setName}
              tagline={tagline}
              setTagline={setTagline}
            /></div>
            <ProfileLivePreview image={image} name={name} tagline={tagline} registration={registration} template={promptTemplate} prologue={startSettings[0]?.prologue || ''} mediaList={mediaList} />
            </div>
          )}

          {currentTab === 'story_setting' && (
            <StorySettingTab
              name={name}
              tagline={tagline}
              promptTemplate={promptTemplate}
              setPromptTemplate={setPromptTemplate}
              storyPrompt={storyPrompt}
              setStoryPrompt={setStoryPrompt}
              peoplePrompt={peoplePrompt}
              setPeoplePrompt={setPeoplePrompt}
              placesPrompt={placesPrompt}
              setPlacesPrompt={setPlacesPrompt}
              examples={examples}
              setExamples={setExamples}
            />
          )}

          {currentTab === 'start_setting' && (
            <StartSettingTab
              mediaList={mediaList}
              name={name}
              image={image}
              startSettings={startSettings}
              setStartSettings={setStartSettings}
            />
          )}

          {currentTab === 'stats' && <StatsTab stats={stats} setStats={setStats} />}
          
          {currentTab === 'media' && (
            <MediaTabContent mediaList={mediaList} setMediaList={setMediaList} startSettings={startSettings} />
          )}

          {currentTab === 'keyword_book' && (
            <KeywordTabContent
              keywords={keywords}
              setKeywords={setKeywords}
              startSettings={startSettings}
              name={name}
              image={image}
            />
          )}

          {currentTab === 'shortcuts' && (
            <ShortcutsTabContent
              shortcuts={shortcuts}
              setShortcuts={setShortcuts}
              startSettings={startSettings}
              name={name}
              image={image}
            />
          )}

          {currentTab === 'ending' && <EndingTab />}
        </main>

      </div>
    </div>
  );
}

export default function CreateWorkPage() {
  return (
    <Suspense fallback={<div className="text-gray-900 text-sm p-4">로딩 중...</div>}>
      <StoryEditorContent />
    </Suspense>
  );
}
