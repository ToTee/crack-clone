// app/chat/[id]/page.tsx
'use client';

import { use, useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ShortcutsModal from '@/components/ShortcutsModal';
import SettingsModal from '@/components/SettingsModal';
import UserProfileModal, { UserProfileItem } from '@/components/UserProfileModal';
import UserNoteModal from '@/components/UserNoteModal';
import { useLiveStarBalance } from '@/components/LiveStarBalance';
import ChatSettingsMenuModal from '@/components/ChatSettingsMenuModal';
import ChatInputArea from '@/components/ChatInputArea';
import ChatMessagesView from '@/components/ChatMessagesView';
import ChatHeader from '@/components/ChatHeader';
import MyChatsSidebar from '@/components/MyChatsSidebar';
import { getMediaListFromDB } from '@/lib/storage';
import { consumeChatResponse } from '@/lib/chat-stream';
import { loadUserNote } from '@/lib/user-note-client';
import type { MessageAction } from '@/components/MessageActions';

export default function ChatRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [character, setCharacter] = useState<any>(null);
  const [loadError, setLoadError] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState<{ sessionId: string; text: string }>();
  const conversationKey = useMemo(() => JSON.stringify(messages), [messages]);
  const [isLoading, setIsLoading] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const operationLock = useRef(false);
  const [viewMode, setViewMode] = useState<'novel' | 'chat'>('novel');
  
  // 모달 상태들
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isChatsSidebarOpen, setIsChatsSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isUserNoteOpen, setIsUserNoteOpen] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [mediaSettingReady, setMediaSettingReady] = useState(false);
  const [mediaSettingBusy, setMediaSettingBusy] = useState(false);
  const mediaSettingLock = useRef(false);
  useEffect(() => {
    let active = true;
    fetch('/api/display-settings', { cache: 'no-store' }).then(async response => {
      const data = await response.json();
      if (!response.ok || typeof data.showMedia !== 'boolean') throw new Error(data.error || '이미지 표시 설정을 불러오지 못했습니다.');
      if (active) { setShowMedia(data.showMedia); setMediaSettingReady(true); }
    }).catch(error => { if (active) alert(error.message + ' 화면을 새로고침해 주세요.'); });
    return () => { active = false; };
  }, []);
  const changeShowMedia = async (value: boolean) => {
    if (!mediaSettingReady || mediaSettingLock.current) return;
    mediaSettingLock.current = true; setMediaSettingBusy(true);
    const previous = showMedia;
    setShowMedia(value);
    try {
      const response = await fetch('/api/display-settings', { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ showMedia: value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '설정을 저장하지 못했습니다.');
    } catch (error: any) { setShowMedia(previous); alert(error.message); }
    finally { mediaSettingLock.current = false; setMediaSettingBusy(false); }
  };

  // 유저 프로필 & 유저노트 & 단축어 & 미디어 목록
  const [activeUserProfile, setActiveUserProfile] = useState<UserProfileItem | null>(null);
  const [noteReady, setNoteReady] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [shortcutsError, setShortcutsError] = useState('');
  const [shortcuts, setShortcuts] = useState<any[]>([]);
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [selectedStartSetting, setSelectedStartSetting] = useState<any>(null);
  
  const currentRoom = useRef(id);
  currentRoom.current = id;
  const liveSending = useRef(false);
  const generationToken = useRef('');
  const activeRequestToken = useRef('');
  const [isStopping, setIsStopping] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const applyGeneration = (data: any) => {
    const job = data.generation;
    const running = ['running','stopping'].includes(job?.status);
    setIsStopping(job?.status === 'stopping');
    generationToken.current = job?.token || '';
    const list = data.messages.filter((m: any) => !running || !job?.replace_message_id || Number(m.id) < job.replace_message_id).map((m: any) => ({ ...m, id: String(m.id) }));
    if (running) {
      if (!job.replace_message_id) list.push({ id: 'pending-background-user', role: 'user', content: job.user_content });
      if (job.content) list.push({ id: 'pending-background-assistant', role: 'assistant', content: job.content });
    }
    setMessages(list); setIsLoading(running); operationLock.current = running;
    setGenerationError(job?.status === 'error' ? job.error : '');
  };
  useEffect(() => {
    let active = true, checking = false;
    const check = async () => {
      if (liveSending.current || checking) return;
      checking = true;
      try {
        const response = await fetch(`/api/chats/${id}/generation`, { cache: 'no-store' });
        if (!response.ok) return;
        const { generation } = await response.json();
        if (!active || liveSending.current) return;
        if (['running','stopping'].includes(generation?.status) || (generation && generation.token !== generationToken.current) || operationLock.current) {
          const res = await fetch(`/api/chats/${id}?view=chat`, { cache: 'no-store' });
          if (!res.ok) return;
          const data = await res.json();
          if (active && !liveSending.current && !isActing && Array.isArray(data.messages)) applyGeneration(data);
        }
      } catch {} finally { checking = false; }
    };
    const timer = window.setInterval(check, 3000);
    const visible = () => { if (!document.hidden) void check(); };
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); };
  }, [id, isActing]);

  const starBalance = useLiveStarBalance(isLoading);
  const [headerVisible, setHeaderVisible] = useState(true);
  const scrollRef = useRef<HTMLElement>(null);
  const scrollState = useRef({ last: 0, distance: 0, intent: 0, follow: true, answerStarted: false, awaitingAnswer: false });
  const handleChatScroll = (event: React.UIEvent<HTMLElement>) => {
    const el = event.currentTarget;
    const state = scrollState.current;
    const top = Math.max(0, el.scrollTop);
    const delta = top - state.last;
    state.last = top;
    state.follow = el.scrollHeight - top - el.clientHeight < 80;
    if (!window.matchMedia('(max-width: 767px)').matches) return;
    if (top < 8) { setHeaderVisible(true); state.distance = 0; return; }
    if (Date.now() - state.intent > 1200) return;
    state.distance = Math.sign(delta) === Math.sign(state.distance) ? state.distance + delta : delta;
    if (Math.abs(state.distance) >= 16) { setHeaderVisible(state.distance < 0); state.distance = 0; }
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const reloadShortcuts = async (characterId = character?.id) => {
    const res = await fetch(`/api/shortcuts?characterId=${encodeURIComponent(characterId || '')}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '단축어를 불러오지 못했습니다.');
    setShortcuts(data.shortcuts); setShortcutsError('');
  };
  const openShortcuts = () => {
    setShortcutsOpen(true);
    void reloadShortcuts().catch(e => setShortcutsError(e.message));
  };

  useEffect(() => {
    liveSending.current = false; operationLock.current = false; generationToken.current = '';
    setIsLoading(false); setIsStopping(false); activeRequestToken.current = ''; setGenerationError('');
    setIsChatsSidebarOpen(false);
    setHeaderVisible(true); scrollState.current = { last: 0, distance: 0, intent: 0, follow: true, answerStarted: false, awaitingAnswer: false };
    setCharacter(null); setMediaList([]); setMessages([]); setLoadError(''); setRestoredDraft(undefined);
    setNoteReady(false); setNoteError('');
    loadUserNote(id).then(() => { if (currentRoom.current === id) setNoteReady(true); }).catch(e => { if (currentRoom.current === id) setNoteError(e.message); });
    fetch(`/api/chats/${id}?view=chat`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '채팅을 불러오지 못했습니다.');
        return data;
      })
      .then((data) => {
        if (currentRoom.current !== id) return;
        setCharacter(data.character);
        setHasStarted(Boolean(data.session?.has_started) || data.messages?.some((m: any) => m.role === 'user'));
        setSelectedStartSetting(data.startSetting || null);
        setActiveUserProfile(data.userProfile || null);
        if (Array.isArray(data.messages)) {
          applyGeneration(data);
        }
        const characterId = data.character?.id;
        if (characterId) {
          void (async () => {
            let legacy: any[] = [];
            try { const value = JSON.parse(localStorage.getItem(`shortcuts_${characterId}`) || '[]'); if (Array.isArray(value)) legacy = value; } catch {}
            if (legacy.length) {
              const migrated = await fetch('/api/shortcuts', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'migrate',characterId,items:legacy})});
              if (!migrated.ok) throw new Error('기존 단축어를 NAS로 옮기지 못했습니다.');
            }
            await reloadShortcuts(characterId);
          })().catch(e => setShortcutsError(e.message));
          getMediaListFromDB(characterId).then((dbMedia) => {
            if (currentRoom.current === id) setMediaList(dbMedia || []);
          }).catch(e => setShortcutsError(e.message));
        }

      }).catch(error => { if (currentRoom.current === id) setLoadError(error.message); });
  }, [id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const resize = () => {
      const style = getComputedStyle(el);
      el.style.setProperty('--answer-space', `${Math.max(0, el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom))}px`);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [id, character]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const state = scrollState.current;
    const last = messages.at(-1);
    if ((state.awaitingAnswer || isLoading) && !state.answerStarted && last?.role === 'assistant') {
      const answers = el.querySelectorAll<HTMLElement>('[data-answer-start="true"]');
      const answer = answers[answers.length - 1];
      if (answer) {
        const inset = parseFloat(getComputedStyle(el).paddingTop) || 0;
        el.scrollTop += answer.getBoundingClientRect().top - el.getBoundingClientRect().top - inset;
        state.last = el.scrollTop;
        state.answerStarted = true;
        state.awaitingAnswer = false;
        state.follow = false;
      }
    } else if (!state.answerStarted && state.follow) {
      el.scrollTop = el.scrollHeight;
      state.last = el.scrollTop;
    }
  }, [messages, isLoading]);

  const handleMessageAction = async (messageId: string, action: MessageAction, content?: string) => {
    if (operationLock.current) throw new Error('현재 작업이 끝난 뒤 다시 시도해 주세요.');
    operationLock.current = true;
    setIsActing(true);
    try {
      const response = await fetch(`/api/chats/${id}/messages/${messageId}`, {
        method: action === 'edit' ? 'PATCH' : action === 'delete' ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(action === 'edit' ? { body: JSON.stringify({ content }) } : {}),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '변경을 저장하지 못했습니다.');
      if (action === 'branch') {
        window.location.assign(`/chat/${data.id}`);
      } else {
        setMessages(data.messages.map((m: any) => ({ ...m, id: String(m.id) })));
      }
    } finally { operationLock.current = false; setIsActing(false); }
  };

  const executeSendMessage = async (textToSend: string, regenerateMessageId?: string) => {
    if (operationLock.current || !noteReady) return;
    operationLock.current = true;
    setRestoredDraft(undefined);
    let saved = false;
    let background = false;
    liveSending.current = true; setGenerationError(''); setIsStopping(false);
    const requestToken = crypto.randomUUID(); activeRequestToken.current = requestToken;

    const continueStory = !textToSend.trim();
    const newMessages = regenerateMessageId ? messages.slice(0, messages.findIndex(message => message.id === regenerateMessageId)) : [...messages, { id: `pending-${Date.now()}`, role: 'user', content: continueStory ? '[이어서 진행]' : textToSend }];
    setMessages(newMessages);
    scrollState.current.follow = true;
    scrollState.current.answerStarted = false;
    scrollState.current.awaitingAnswer = true;
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestToken, regenerateMessageId,
          characterId: character.id,
          sessionId: id,
          continueStory,
          messages: [{ role: 'user', content: textToSend }],
          isNovelMode: viewMode === 'novel',
          userProfile: activeUserProfile,
          startSetting: selectedStartSetting,
        }),
      });

      const assistantMsgId = `pending-assistant-${Date.now()}`;
      await consumeChatResponse(response, (content) => {
        if (currentRoom.current !== id) return;
        setMessages([...newMessages, { id: assistantMsgId, role: 'assistant', content }]);
      });
      saved = true;
      if (currentRoom.current !== id) return;
      setHasStarted(true);
      const refreshed = await fetch(`/api/chats/${id}?view=chat`, { cache: 'no-store' });
      if (!refreshed.ok) throw new Error('저장된 메시지를 불러오지 못했습니다.');
      const data = await refreshed.json();
      if (!Array.isArray(data.messages)) throw new Error('메시지 목록을 확인할 수 없습니다.');
      if (currentRoom.current !== id) return;
      setActiveUserProfile(data.userProfile || null);
      setMessages(data.messages.map((m: any) => ({ ...m, id: String(m.id) })));
    } catch (err: any) {
      if (currentRoom.current !== id) return;
      // A lost browser stream does not cancel the server job. Reconcile before allowing retry.
      try {
        const res = await fetch(`/api/chats/${id}?view=chat`, { cache: 'no-store' });
        if (!res.ok) throw new Error('연결 실패');
        const data = await res.json();
        if (currentRoom.current !== id) return;
        applyGeneration(data);
        background = ['running','stopping'].includes(data.generation?.status);
        if (!background && !['done','stopped'].includes(data.generation?.status)) {
          if (!regenerateMessageId) setRestoredDraft({ sessionId: id, text: textToSend });
          setGenerationError(data.generation?.error || err.message);
        }
      } catch {
        background = true;
        setGenerationError('연결이 끊겼습니다. NAS의 생성 상태를 다시 확인하는 중입니다.');
      }
    } finally {
      if (currentRoom.current === id) {
        liveSending.current = false; activeRequestToken.current = '';
        if (!background) setIsStopping(false);
        operationLock.current = background;
        setIsLoading(background);
      }
    }
  };

  const regenerateAnswer = async (messageId: string) => {
    if (operationLock.current || !noteReady) return;
    const index = messages.findIndex(message => message.id === messageId);
    if (index < 1 || messages[index - 1]?.role !== 'user') return;
    if (index < messages.length - 1 && !window.confirm('이 답변을 재생성할까요? 새 답변이 완성되면 선택한 답변과 그 이후 대화가 교체됩니다. 실패하거나 중단하면 기존 대화는 유지됩니다.')) return;
    await executeSendMessage('', messageId);
  };
  const stopGeneration = async () => {
    if (isStopping) return;
    const token = activeRequestToken.current || generationToken.current;
    if (!token) return;
    setIsStopping(true); setGenerationError('');
    try {
      const response = await fetch(`/api/chats/${id}/generation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '중단하지 못했습니다.');
    } catch (error: any) { if (currentRoom.current === id) { setIsStopping(false); setGenerationError(error.message); } }
  };

  if (!character) {
    return <div className="min-h-screen bg-white text-gray-900 flex items-center justify-center">{loadError ? <div role="alert" className="text-center"><p>{loadError}</p><button className="mt-3 underline" onClick={() => window.location.reload()}>다시 시도</button></div> : '로딩 중...'}</div>;
  }

  return (
    <div className="fixed inset-0 md:relative h-dvh overflow-hidden bg-white text-gray-900 flex justify-center">
      <div className="relative flex flex-col h-full min-h-0 w-full max-w-2xl bg-white border-x border-gray-200 shadow-2xl">
        
        {/* 상단 헤더 */}
        <div className={`absolute inset-x-0 top-0 z-30 bg-white pt-[env(safe-area-inset-top)] transition-transform duration-200 motion-reduce:transition-none md:relative md:translate-y-0 md:pt-0 shrink-0 ${headerVisible ? 'translate-y-0' : '-translate-y-full invisible md:visible'}`}>
        <ChatHeader
          starBalance={starBalance}
          character={character}
          activeUserProfile={activeUserProfile}
          onOpenChats={() => setIsChatsSidebarOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenMenu={() => setIsMenuOpen(true)}
        />

        </div>
        {/* 본문 메시지 영역 (IndexedDB에서 로드한 mediaList 전달) */}
        <ChatMessagesView
          messages={messages}
          viewMode={viewMode}
          showMedia={showMedia}
          character={character}
          activeUserProfile={activeUserProfile}
          isLoading={isLoading}
          mediaList={mediaList}
          startSetting={selectedStartSetting}
          actionsDisabled={isActing || !noteReady}
          onRegenerate={regenerateAnswer}
          onMessageAction={handleMessageAction}
          scrollRef={scrollRef}
          onScroll={handleChatScroll}
          onScrollIntent={() => { scrollState.current.intent = Date.now(); }}
          messagesEndRef={messagesEndRef}
        />

        {noteError && <p role="alert" className="px-4 py-2 text-sm text-red-600">{noteError} <button className="underline" onClick={() => setIsUserNoteOpen(true)}>유저노트 다시 열기</button></p>}
        {generationError && <p role="status" className="px-4 py-2 text-sm text-red-600">{generationError}</p>}
        {shortcutsError && <p role="alert" className="px-4 py-2 text-sm text-red-600">{shortcutsError} <button onClick={openShortcuts} className="underline">다시 열기</button></p>}
        {/* 하단 입력 폼 */}
        <ChatInputArea
          key={id}
          sessionId={id}
          conversationKey={conversationKey}
          suggestedReplies={!hasStarted && !isLoading && !messages.some(m => m.role === 'user') && Array.isArray(selectedStartSetting?.suggestedReplies) ? selectedStartSetting.suggestedReplies.filter((r: unknown) => typeof r === 'string' && r.trim()) : []}
          restoredDraft={restoredDraft}
          isLoading={isLoading || isActing || !noteReady}
          isGenerating={isLoading}
          isStopping={isStopping}
          onStop={stopGeneration}
          viewMode={viewMode}
          shortcuts={shortcuts}
          onManageShortcuts={openShortcuts}
          onSendMessage={executeSendMessage}
        />

        {shortcutsOpen && <ShortcutsModal characterId={character.id} items={shortcuts} onClose={() => setShortcutsOpen(false)} onReload={() => reloadShortcuts()} />}
        {/* 팝업 모달들 */}
        {isChatsSidebarOpen && <MyChatsSidebar
          isOpen={isChatsSidebarOpen}
          onClose={() => setIsChatsSidebarOpen(false)}
          onDeleted={(deletedId) => { if (deletedId === id) { setIsChatsSidebarOpen(false); router.replace('/'); } }}
        />}
        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        <ChatSettingsMenuModal
          starBalance={starBalance}
          viewMode={viewMode}
          setViewMode={setViewMode}
          sessionId={id}
          isOpen={isMenuOpen}
          onClose={() => setIsMenuOpen(false)}
          onOpenShortcuts={openShortcuts}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenUserNote={() => setIsUserNoteOpen(true)}
          onOpenSystemSettings={() => setIsSettingsOpen(true)}
          showMedia={showMedia}
          setShowMedia={changeShowMedia}
          mediaSettingDisabled={!mediaSettingReady || mediaSettingBusy}
        />
        <UserProfileModal
          sessionId={id}
          selectedProfileId={activeUserProfile?.id || ''}
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          onSelectProfile={(profile) => setActiveUserProfile(profile)}
        />
        <UserNoteModal
          isOpen={isUserNoteOpen}
          onClose={() => setIsUserNoteOpen(false)}
          characterId={id}
          onSaveNote={() => { setNoteReady(true); setNoteError(''); }}
        />

      </div>
    </div>
  );
}
