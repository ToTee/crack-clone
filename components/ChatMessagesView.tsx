// components/ChatMessagesView.tsx
'use client';

import { memo, useMemo } from 'react';
import { automaticMedia, prologueMedia, replaceUserName } from '@/lib/chat-media';

import { visibleAnswer } from '@/lib/visible-answer';
import StoryMarkdown from '@/components/StoryMarkdown';
import { shortcutLabel } from '@/lib/shortcuts';
import PreviewNovelView from '@/components/PreviewNovelView';
import MessageActions, { MessageAction } from '@/components/MessageActions';
import { UserProfileItem } from '@/components/UserProfileModal';

// Streaming changes only the current answer; keep completed Markdown trees intact.
const MemoStoryMarkdown = memo(StoryMarkdown);
const MemoPreviewNovelView = memo(PreviewNovelView);
const emptyReplies: string[] = [];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  messages: Message[];
  viewMode: 'novel' | 'chat';
  showMedia: boolean;
  character: any;
  activeUserProfile: UserProfileItem | null;
  isLoading: boolean;
  mediaList?: any[];
  startSetting?: any;
  actionsDisabled?: boolean;
  onRegenerate?: (id: string) => Promise<void>;
  onMessageAction?: (id: string, action: MessageAction, content?: string) => Promise<void>;
  scrollRef?: React.RefObject<HTMLElement | null>;
  onScroll?: React.UIEventHandler<HTMLElement>;
  onScrollIntent?: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export default function ChatMessagesView({
  messages,
  viewMode,
  showMedia,
  character,
  activeUserProfile,
  isLoading,
  mediaList = [],
  startSetting,
  actionsDisabled = false,
  onMessageAction,
  onRegenerate,
  messagesEndRef,
  scrollRef, onScroll, onScrollIntent,
}: Props) {
  const scope = Number(startSetting?.id ?? 0);
  const regularMedia = useMemo(() => showMedia ? automaticMedia(mediaList, scope) : [], [showMedia, mediaList, scope]);
  const firstMedia = useMemo(() => showMedia ? prologueMedia(mediaList, scope) : [], [showMedia, mediaList, scope]);
  return (
    <main ref={scrollRef} onScroll={onScroll} onWheel={onScrollIntent} onTouchMove={onScrollIntent} onPointerDown={onScrollIntent} className="min-h-0 overscroll-contain flex-1 overflow-y-auto p-5 sm:p-7 pt-[calc(5.25rem+env(safe-area-inset-top))] md:pt-7 space-y-6">
      {messages.map((m, index) => {
        const isUser = m.role === 'user';
        const isPrologue = index === 0 && !isUser;
        const visibleMedia = isPrologue ? firstMedia : regularMedia;
        const commandLabel = isUser ? shortcutLabel(m.content) : null;
        const answerContent = isUser ? m.content : visibleAnswer(m.content);
        const displayedContent = replaceUserName(answerContent, activeUserProfile?.name);
        const actions = onMessageAction && <MessageActions content={answerContent}
          onRegenerate={!isUser && index > 0 && messages[index - 1]?.role === 'user' && onRegenerate ? () => onRegenerate(m.id) : undefined}
          disabled={isLoading || actionsDisabled || !/^\d+$/.test(m.id)}
          onAction={(action, content) => onMessageAction(m.id, action, content)} />;

        if (viewMode === 'novel') {
          return (
            <div key={m.id} data-answer-start={!isUser ? 'true' : undefined} style={!isUser && index === messages.length - 1 ? { minHeight: 'var(--answer-space, 0px)' } : undefined} className={`rounded-2xl ${
              isUser ? 'w-fit max-w-[85%] ml-auto px-4 py-2.5 [overflow-wrap:anywhere] bg-sky-50 border border-sky-200' : 'p-5 bg-white border border-gray-200 shadow-sm'
            }`}>
              {commandLabel ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{commandLabel}</p> : <MemoPreviewNovelView
                content={displayedContent}
                name={character.name}
                mediaList={visibleMedia}
                showImages={showMedia}
                playGuide={m.id === 'first' ? replaceUserName(startSetting?.playGuide || '', activeUserProfile?.name) : ''}
                suggestedReplies={emptyReplies}
              />}
              {actions}
            </div>
          );
        }

        return (
          <div key={m.id} data-answer-start={!isUser ? 'true' : undefined} style={!isUser && index === messages.length - 1 ? { minHeight: 'var(--answer-space, 0px)' } : undefined} className={`flex ${isUser ? 'justify-end' : 'justify-start items-start gap-3'}`}>
            {!isUser && (
              <img src={character.avatar} alt={character.name} className="w-9 h-9 rounded-full object-cover mt-1 shrink-0" />
            )}
            <div
              style={{ fontFamily: '"Malgun Gothic", "맑은 고딕", Arial, sans-serif', WebkitTextStroke: '0.1px currentColor' }}
              className={`${isUser ? 'w-fit min-w-0 max-w-[85%] [overflow-wrap:anywhere] px-4 py-2.5' : 'max-w-[78%] px-5 py-3'} rounded-2xl text-sm font-normal leading-relaxed whitespace-pre-wrap ${
                isUser
                  ? 'bg-sky-50 text-slate-800 border border-sky-200 rounded-br-none shadow-sm'
                  : 'bg-gray-50 text-gray-800 border border-gray-200 rounded-tl-none shadow-md'
              }`}
            >
              {commandLabel ? <p>{commandLabel}</p> : <MemoStoryMarkdown content={displayedContent} mediaList={visibleMedia}
                showImages={showMedia} />}
              {actions}
            </div>
          </div>
        );
      })}

      {isLoading && (
        <div className="text-xs text-sky-600 animate-pulse bg-sky-50 px-4 py-2 rounded-xl border border-sky-200 w-fit">
          장면을 서술하고 있습니다...
        </div>
      )}
      <div ref={messagesEndRef} />
    </main>
  );
}
