// app/page.tsx
'use client';
import { prefetchCharacterInfo } from '@/lib/character-info-client';

import { useEffect, useState } from 'react';
import { UserRound, BookOpen, MessageSquare, Sparkles, Settings, Plus, Menu, Star } from 'lucide-react';
import ShortcutsModal from '@/components/ShortcutsModal';
import type { ChatShortcut } from '@/lib/shortcuts';
import UserProfileModal from '@/components/UserProfileModal';
import GlobalPromptModal from '@/components/GlobalPromptModal';
import SettingsModal from '@/components/SettingsModal';
import CreateTypeModal from '@/components/CreateTypeModal';
import Link from 'next/link';
import { loadList, peekList } from '@/lib/list-client';
import MyWorksSidebar from '@/components/MyWorksSidebar';
import MyChatsSidebar from '@/components/MyChatsSidebar';
import StarHistory from '@/components/StarHistory';

interface Character {
  id: string;
  name: string;
  tagline: string;
  avatar: string;
  tags: string;
}

export default function HomeScreen({ myWorks = false, starHistory = false }: { myWorks?: boolean; starHistory?: boolean }) {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<ChatShortcut[]>([]);
  const [shortcutsLoading, setShortcutsLoading] = useState(false);
  const [shortcutsError, setShortcutsError] = useState('');
  const reloadShortcuts = async () => {
    const res = await fetch('/api/shortcuts', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '단축어를 불러오지 못했습니다.');
    setShortcuts(data.shortcuts);
  };
  const openShortcuts = async () => {
    setShortcutsLoading(true); setShortcutsError('');
    try { await reloadShortcuts(); setShortcutsOpen(true); }
    catch (error) { setShortcutsError(error instanceof Error ? error.message : '단축어를 불러오지 못했습니다.'); }
    finally { setShortcutsLoading(false); }
  };
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [characters, setCharacters] = useState<Character[]>(() => peekList('/api/characters?summary=1'));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isChatsSidebarOpen, setIsChatsSidebarOpen] = useState(false);

  const [worksError, setWorksError] = useState('');
  const fetchCharacters = () => {
    setWorksError('');
    loadList('/api/characters?summary=1').then(setCharacters).catch(error => setWorksError(error.message));
  };

  useEffect(() => {
    if (!starHistory) fetchCharacters();
  }, [starHistory]);

  return (
    <div className="min-h-screen bg-white text-gray-900 pb-20">
      {/* 상단 네비바 */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-200 px-4 sm:px-6 py-3.5 flex flex-wrap gap-3 items-center justify-between shadow-sm">
        
        {/* 좌측 내 채팅 사이드바 버튼 & 로고 */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsChatsSidebarOpen(true)}
            className="p-2 bg-white hover:bg-sky-50 border border-gray-200 text-gray-700 hover:text-sky-600 rounded-xl transition flex items-center gap-1.5 text-xs font-semibold shadow-sm"
            title="내 채팅 목록 열기"
          >
            <Menu className="w-4 h-4 text-sky-600" />
            <span className="hidden sm:inline">내 채팅</span>
          </button>

          <Link href="/" aria-label="홈으로 이동" title="홈으로 이동" className="flex items-center gap-2 rounded-lg p-1 hover:bg-sky-50">
            <Sparkles className="w-5 h-5 text-sky-600" />
          </Link>

        </div>

        {/* 우측 액션 버튼들 */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Link href="/stars" aria-label="나의 별" aria-current={starHistory ? 'page' : undefined} title="나의 별" className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition ${starHistory ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-gray-200 bg-white text-gray-700 hover:bg-amber-50'}`}><Star className="h-4 w-4 fill-amber-400 text-amber-500" /><span>별</span></Link>
          <Link
            href="/my-works"
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-sky-50 hover:text-sky-600"
            title="내 작품 목록 열기"
          >
            <BookOpen className="h-4 w-4 text-sky-600" />
            <span>내 작품</span>
          </Link>
          <button type="button" onClick={() => setIsProfileOpen(true)} title="대화 프로필 관리" className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-sky-50 hover:text-sky-600"><UserRound className="h-4 w-4 text-sky-600" />대화 프로필</button>
          <button type="button" onClick={openShortcuts} disabled={shortcutsLoading} title="단축어 관리" className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-sky-50 disabled:opacity-50">{shortcutsLoading ? '불러오는 중…' : '단축어'}</button>
          <button type="button" onClick={() => setIsPromptOpen(true)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-sky-50">프롬프트</button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:opacity-90 text-white rounded-xl text-xs font-bold transition shadow-lg"
          >
            <Plus className="w-4 h-4" />
            작품 만들기
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 bg-white hover:bg-sky-50 border border-gray-200 text-gray-700 hover:text-sky-600 rounded-xl transition shadow-sm"
            title="AI 설정"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {shortcutsError && <p role="alert" className="px-5 py-3 text-sm text-red-600">{shortcutsError} <button type="button" onClick={openShortcuts} className="underline">다시 시도</button></p>}
      {shortcutsOpen && <ShortcutsModal items={shortcuts} onClose={() => setShortcutsOpen(false)} onReload={reloadShortcuts} />}
      {/* 메인 피드 컨테이너 */}
      {!starHistory && worksError && <p role="alert" className="mx-auto max-w-5xl p-4 text-sm text-red-600">{worksError} <button onClick={fetchCharacters} className="underline">다시 시도</button></p>}
      {starHistory ? <StarHistory /> : myWorks ? <MyWorksSidebar works={characters} onRefresh={fetchCharacters} onCreate={() => setIsCreateModalOpen(true)} /> : (
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6">
        <div className="mb-5 flex justify-between items-end">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">스토리 & 캐릭터</h2>
            <p className="text-xs text-gray-500">원하는 작품을 선택해 대화 또는 소설을 즐겨보세요.</p>
          </div>
        </div>

        {/* 컴팩트 썸네일 그리드 (모바일 2열, 태블릿 3열, PC 5열) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {characters.map((char) => (
            <Link
              key={char.id}
              href={`/character/${char.id}`}
              onPointerEnter={() => prefetchCharacterInfo(char.id)} onFocus={() => prefetchCharacterInfo(char.id)} onTouchStart={() => prefetchCharacterInfo(char.id)}
              className="group relative aspect-[4/5] rounded-2xl overflow-hidden border border-gray-200 hover:border-sky-400 transition duration-300 flex flex-col justify-end p-3.5 shadow-md hover:shadow-lg bg-white"
            >
              {/* 배경 이미지 */}
              <img
                src={char.avatar}
                alt={char.name}
                className="absolute inset-0 w-full h-full object-contain"
              />
              
              {/* 그라데이션 오버레이 */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

              {/* 카드 하단 텍스트 정보 */}
              <div className="relative z-10 space-y-1">
                {/* 태그 (1~2개만 축약) */}
                <div className="flex flex-wrap gap-1">
                  {char.tags?.split(',').slice(0, 2).map((tag, i) => (
                    <span key={i} className="text-[10px] bg-white/20 backdrop-blur-md px-1.5 py-0.5 rounded-md text-white font-medium">
                      #{tag.trim()}
                    </span>
                  ))}
                </div>

                {/* 작품 제목 */}
                <h3 className="text-sm font-bold text-white flex items-center justify-between leading-snug">
                  <span className="truncate pr-1">{char.name}</span>
                  <MessageSquare className="w-3.5 h-3.5 text-sky-600 opacity-0 group-hover:opacity-100 transition shrink-0" />
                </h3>

                {/* 한 줄 소개 */}
                <p className="text-[11px] text-gray-200 line-clamp-1">
                  {char.tagline || '소개가 없습니다.'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </main>
      )}


      {/* 사이드바 및 팝업 모달 */}
      <MyChatsSidebar isOpen={isChatsSidebarOpen} onClose={() => setIsChatsSidebarOpen(false)} />
      <CreateTypeModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
      <UserProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      <GlobalPromptModal isOpen={isPromptOpen} onClose={() => setIsPromptOpen(false)} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
