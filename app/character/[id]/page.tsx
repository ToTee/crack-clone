'use client';
import { loadCharacterInfo } from '@/lib/character-info-client';
import { loadUserProfiles } from '@/lib/user-profiles-client';
import CollapsibleDescription from '@/components/CollapsibleDescription';
import ProloguePreview from '@/components/ProloguePreview';
import { type ChatMedia } from '@/lib/chat-media';
import { parseEditorConfig } from '@/lib/prompt-templates';

import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, ChevronLeft, ChevronDown, MessageCircle, Play, UserRound } from 'lucide-react';
import UserProfileModal, { UserProfileItem } from '@/components/UserProfileModal';
import { getMediaListFromDB } from '@/lib/storage';

interface StartSetting {
  id: number;
  label: string;
  name: string;
  prologue: string;
  situation: string;
  playGuide: string;
  suggestedReplies: string[];
}

interface Character {
  id: string;
  name: string;
  tagline: string;
  editor_config?: string;
  avatar: string;
  tags: string;
  first_message: string;
  start_settings?: string;
}

async function readLatestChat(characterId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}/latest-chat`, { cache: 'no-store', signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '이어할 채팅방을 확인하지 못했습니다. 다시 시도해 주세요.');
  return data.chat as { id: string; title: string } | null;
}

export default function CharacterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [character, setCharacter] = useState<Character | null>(null);
  const [profiles, setProfiles] = useState<UserProfileItem[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [selectedSettingIndex, setSelectedSettingIndex] = useState(0);
  const [mediaList, setMediaList] = useState<ChatMedia[]>([]);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [latestChat, setLatestChat] = useState<{ id: string; title: string } | null>(null);
  const [continueError, setContinueError] = useState('');

  const [loadError, setLoadError] = useState('');
  const [profileError, setProfileError] = useState('');
  const loadProfiles = async () => {
    try { const data = await loadUserProfiles(); setProfiles(data.profiles); setSelectedProfileId(data.activeId); setProfileError(''); }
    catch (e) { setProfileError(e instanceof Error ? e.message : '프로필 불러오기 실패'); }
  };

  useEffect(() => {
    let active = true;
    setCharacter(null); setMediaList([]); setSelectedSettingIndex(0); setLoadError('');
    loadCharacterInfo(id).then(data => { if (active) setCharacter(data); })
      .catch(error => { if (active) setLoadError(error.message); });

    loadProfiles();
    getMediaListFromDB(id).then((items) => {
      if (active) setMediaList(items);
    }).catch(e => { if (active) setProfileError(e.message); });
    return () => { active = false; };
  }, [id]);

  const startSettings = useMemo<StartSetting[]>(() => {
    if (!character) return [];
    try {
      const parsed = JSON.parse(character.start_settings || '[]');
      if (Array.isArray(parsed)) {
        const usable = parsed.filter((setting) => setting?.prologue?.trim());
        if (usable.length > 0) return usable;
      }
    } catch {}

    return [{
      id: 0,
      label: '기본 설정',
      name: '기본 설정',
      prologue: character.first_message || '',
      situation: character.tagline || '',
      playGuide: '',
      suggestedReplies: [],
    }];
  }, [character]);

  const selectedSetting = startSettings[selectedSettingIndex] || startSettings[0];

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const refresh = () => {
      if (document.hidden) return;
      readLatestChat(id, controller.signal).then(chat => {
        if (active) { setLatestChat(chat); setContinueError(''); }
      }).catch(error => {
        if (active && error.name !== 'AbortError') setContinueError(error.message);
      });
    };
    setLatestChat(null); setContinueError(''); setIsStarting(false); setIsContinuing(false);
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false; controller.abort();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [id]);

  const handleContinue = async () => {
    if (isStarting || isContinuing) return;
    setIsContinuing(true); setContinueError('');
    try {
      // Re-read at click time: another tab may have chatted or deleted a room.
      const chat = await readLatestChat(id);
      setLatestChat(chat);
      if (!chat) throw new Error('이어할 채팅방이 없습니다. 새로하기로 시작해 주세요.');
      router.push(`/chat/${encodeURIComponent(chat.id)}`);
    } catch (error) {
      setContinueError(error instanceof Error ? error.message : '채팅방을 열지 못했습니다. 다시 시도해 주세요.');
      setIsContinuing(false);
    }
  };

  const handleStart = async () => {
    if (isStarting || isContinuing) return;
    setIsStarting(true);
    try {
      const userProfile = profiles.find((profile) => profile.id === selectedProfileId) || null;
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: id, startSettingIndex: selectedSettingIndex, userProfile }),
      });
      const data = await res.json();
      if (!res.ok || !data.id) throw new Error(data.error || '채팅방 생성 실패');
      router.push(`/chat/${data.id}`);
    } catch (error: any) {
      alert(error.message);
      setIsStarting(false);
    }
  };

  if (!character || !selectedSetting) {
    return <div className="min-h-screen bg-white flex items-center justify-center text-sm text-gray-500">{loadError ? <div role="alert"><p>{loadError}</p><button onClick={() => window.location.reload()} className="mt-3 underline">다시 시도</button></div> : '작품 정보 불러오는 중...'}</div>;
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 pb-28">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" aria-label="홈으로 이동" title="홈으로 이동" className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-50 transition">
              <Sparkles className="h-5 w-5" />
            </Link>
            <Link href="/" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-lg font-bold">스토리 정보</h1>
          </div>
          <Link href={`/edit/${id}`} className="text-xs font-semibold text-gray-500 hover:text-sky-600">작품 수정</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl">
        <section className="grid gap-6 border-b border-gray-200 px-5 py-6 sm:grid-cols-[220px_1fr] sm:px-7">
          <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 shadow-md">
            <img src={character.avatar} alt={character.name} className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-col justify-center">
            <h2 className="text-2xl font-bold leading-tight">{character.name}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">{character.tagline || '소개가 없습니다.'}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {character.tags?.split(',').filter(Boolean).map((tag) => (
                <span key={tag} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600">
                  #{tag.trim()}
                </span>
              ))}
            </div>
            <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <h3 className="text-sm font-bold">상세 설명</h3>
              {parseEditorConfig(character.editor_config)?.registration && <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">{(() => { const r = parseEditorConfig(character.editor_config).registration; return [r.genre, r.target, r.conversation, r.recommendedMode && `권장: ${r.recommendedMode}`, r.audience === 'adult' ? '성인 대상' : ''].filter(Boolean).map((label, i) => <span key={i} className="rounded border border-slate-200 px-2 py-1">{label}</span>); })()}</div>}
              <CollapsibleDescription key={id} text={parseEditorConfig(character.editor_config)?.registration?.description || selectedSetting.situation || character.tagline || '등록된 상세 설명이 없습니다.'} images={parseEditorConfig(character.editor_config)?.registration?.descriptionImages} />
            </div>
          </div>
        </section>

        <section className="space-y-5 border-b border-gray-200 px-5 py-6 sm:px-7">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-base font-bold"><UserRound className="h-4 w-4" />대화 프로필</label>
              <button onClick={() => setIsProfileModalOpen(true)} className="text-xs font-semibold text-sky-600 hover:text-sky-700">추가·수정</button>
            </div>
            <div className="relative">
              <select
                value={selectedProfileId}
                onChange={(event) => setSelectedProfileId(event.target.value)}
                className="w-full appearance-none rounded-xl border border-gray-300 bg-white px-4 py-3 pr-10 text-sm outline-none focus:border-sky-500"
              >
                <option value="">프로필 없이 시작</option>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label || profile.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-gray-400" />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-base font-bold">시작 상황</label>
            <div className="relative">
              <select
                value={selectedSettingIndex}
                onChange={(event) => setSelectedSettingIndex(Number(event.target.value))}
                className="w-full appearance-none rounded-xl border border-gray-300 bg-white px-4 py-3 pr-10 text-sm outline-none focus:border-sky-500"
              >
                {startSettings.map((setting, index) => (
                  <option key={`${setting.id}-${index}`} value={index}>{setting.name || setting.label || `시작 설정 ${index + 1}`}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-gray-400" />
            </div>
          </div>
        </section>

        <section className="space-y-4 px-5 py-6 sm:px-7">
          <h3 className="text-lg font-bold">프롤로그 미리보기</h3>
          <div className="max-h-96 overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <ProloguePreview setting={selectedSetting} mediaList={mediaList} name={character.name} profileName={profiles.find(profile => profile.id === selectedProfileId)?.name} />
          </div>
          {selectedSetting.playGuide && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-800">
              <strong className="mb-1 block">플레이 가이드</strong>
              {selectedSetting.playGuide}
            </div>
          )}
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 p-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl gap-3">
        {latestChat && (
          <button
            type="button"
            onClick={handleContinue}
            disabled={isStarting || isContinuing}
            title={`이어할 채팅방: ${latestChat.title}`}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-sky-300 bg-sky-50 py-3.5 text-sm font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
          >
            <Play className="h-5 w-5" />
            {isContinuing ? '불러오는 중...' : '이어하기'}
          </button>
        )}
        <button
          type="button"
          onClick={handleStart}
          disabled={isStarting || isContinuing}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 py-3.5 text-sm font-bold text-white shadow-lg hover:opacity-90 disabled:opacity-50"
        >
          <MessageCircle className="h-5 w-5" />
          {isStarting ? '새 채팅 만드는 중...' : '새로하기'}
        </button>
        </div>
        {continueError && <p role="alert" className="mx-auto mt-2 max-w-4xl text-sm text-red-600">{continueError} <button type="button" onClick={() => readLatestChat(id).then(chat => { setLatestChat(chat); setContinueError(''); }).catch(error => setContinueError(error.message))} className="underline">다시 확인</button></p>}
      </div>

      {profileError && <p role="alert" className="p-4 text-sm text-red-600">{profileError} <button onClick={loadProfiles}>다시 불러오기</button></p>}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => { setIsProfileModalOpen(false); loadProfiles(); }}
        onSelectProfile={(profile) => {
          setSelectedProfileId(profile?.id || '');
          loadProfiles();
        }}
      />
    </div>
  );
}
