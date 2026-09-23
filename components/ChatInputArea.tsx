// components/ChatInputArea.tsx
'use client';

import { Send, Square, Asterisk, Slash, ListPlus, X } from 'lucide-react';

import { useState, useRef, useEffect, useMemo } from 'react';
import { filterShortcuts, shortcutMessage, type ChatShortcut } from '@/lib/shortcuts';

interface Props {
  sessionId: string;
  conversationKey: string;
  suggestedReplies?: string[];
  restoredDraft?: { sessionId: string; text: string };
  isLoading: boolean;
  isGenerating?: boolean;
  isStopping?: boolean;
  onStop?: () => void;
  viewMode: 'novel' | 'chat';
  shortcuts: ChatShortcut[];
  onManageShortcuts: () => void;
  onSendMessage: (text: string) => void;
}

export default function ChatInputArea({
  sessionId, conversationKey,
  suggestedReplies = [],
  restoredDraft,
  isLoading,
  isGenerating = false, isStopping = false, onStop,
  viewMode,
  shortcuts,
  onManageShortcuts,
  onSendMessage,
}: Props) {
  // Keep keystrokes local: typing must not re-render the conversation tree.
  const [inputText, setInputText] = useState('');
  const [showShortcutsMenu, setShowShortcutsMenu] = useState(false);
  useEffect(() => {
    if (restoredDraft?.sessionId === sessionId) {
      setInputText(current => current || restoredDraft.text);
    }
  }, [restoredDraft, sessionId]);
  const pendingShortcut = useRef<ChatShortcut | null>(null);
  useEffect(() => { pendingShortcut.current = null; }, [sessionId]);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [repliesHidden, setRepliesHidden] = useState(false);
  const [generated, setGenerated] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [replyError, setReplyError] = useState('');
  useEffect(() => {
    requestRef.current?.abort(); requestRef.current = null;
    setGenerated([]); setGenerating(false); setReplyError(''); setRepliesHidden(false);
    return () => { requestRef.current?.abort(); requestRef.current = null; };
  }, [sessionId, conversationKey, isLoading]);
  const closeReplies = () => {
    requestRef.current?.abort(); requestRef.current = null;
    setGenerating(false); setGenerated([]); setReplyError(''); setRepliesHidden(true);
  };
  const insertToken = (token: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? inputText.length;
    const end = input?.selectionEnd ?? start;
    const value = token === '/' ? '/' + inputText : inputText.slice(0, start) + '**' + inputText.slice(end);
    const cursor = token === '/' ? 1 : start + 1;
    setInputText(value); setSelected(0); setSource('all'); setShowShortcutsMenu(token === '/');
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(cursor, cursor); });
  };
  const generateReplies = async () => {
    if (isLoading || requestRef.current) return;
    const controller = new AbortController(); requestRef.current = controller;
    setRepliesHidden(false); setGenerating(true); setReplyError(''); setGenerated([]); setShowShortcutsMenu(false);
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(sessionId)}/suggestions`, { method: 'POST', signal: controller.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '추천답변을 만들지 못했어요.');
      if (requestRef.current === controller) setGenerated(data.replies);
    } catch (e) {
      if (!controller.signal.aborted) setReplyError(e instanceof Error ? e.message : '추천답변을 만들지 못했어요.');
    } finally { if (requestRef.current === controller) { requestRef.current = null; setGenerating(false); } }
  };
  const replies = repliesHidden || generating || replyError ? [] : generated.length ? generated : suggestedReplies;
  const [source, setSource] = useState('all');
  const [selected, setSelected] = useState(0);
  const filtered = useMemo(() => showShortcutsMenu ? filterShortcuts(shortcuts, inputText, source) : [], [showShortcutsMenu, shortcuts, inputText, source]);
  const active = Math.min(selected, Math.max(0, filtered.length - 1));
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);
    setSelected(0);
    const chosen = pendingShortcut.current;
    const command = chosen ? `/${chosen.name}` : '';
    if (chosen && (val === command || val.startsWith(command + ' ') || val.startsWith(command + '\n'))) {
      setShowShortcutsMenu(false);
    } else if (val.startsWith('/')) {
      pendingShortcut.current = null;
      setShowShortcutsMenu(true);
    } else {
      setShowShortcutsMenu(false);
    }
  };

  const handleSelectShortcut = (sc: ChatShortcut) => {
    if (isLoading) return;
    pendingShortcut.current = sc;
    const value = `/${sc.name}`;
    setInputText(value);
    setShowShortcutsMenu(false);
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(value.length, value.length); });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (showShortcutsMenu && filtered.length) { handleSelectShortcut(filtered[active]); return; }
    if (showShortcutsMenu && inputText.startsWith('/')) return;
    const chosen = pendingShortcut.current;
    const command = chosen ? `/${chosen.name}` : '';
    const isChosen = chosen && (inputText === command || inputText.startsWith(command + ' ') || inputText.startsWith(command + '\n'));
    onSendMessage(isChosen ? shortcutMessage(chosen) + (inputText.slice(command.length).trim() ? '\n\n' + inputText.slice(command.length).trim() : '') : inputText);
    pendingShortcut.current = null;
    setInputText('');
    setShowShortcutsMenu(false);
  };

  return (
    <footer className="p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white border-t border-gray-200 relative shrink-0">
      {!repliesHidden && (replies.length > 0 || generating || replyError) && (
        <div className="mb-3 space-y-2" aria-label="추천답변">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500" role="status">{generating ? '추천답변 생성 중…' : '추천답변'}</p>
            <button type="button" onClick={closeReplies} aria-label={generating ? '추천답변 생성 취소' : '추천답변 닫기'} title={generating ? '생성 취소' : '닫기'} className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
          {replyError && <p role="alert" className="text-sm text-red-600">{replyError}</p>}
          <div className="flex flex-wrap gap-2">
            {replies.map((reply, index) => <button key={index} type="button" disabled={isLoading}
              onClick={() => { if (!isLoading) { setInputText(reply); setShowShortcutsMenu(false); inputRef.current?.focus(); } }}
              className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-left text-sm text-sky-800 hover:bg-sky-100 disabled:opacity-50 break-words">{reply}</button>)}
          </div>
        </div>
      )}
      {showShortcutsMenu && (
        <div className="absolute bottom-full left-4 right-4 mb-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="flex gap-3 px-3 border-b border-slate-100 text-xs">
            {([['all','전체'],['creator','제작자 단축어'],['personal','내 단축어']] as const).map(([key,label]) => <button type="button" key={key} onClick={() => {setSource(key);setSelected(0);}} className={`py-3 ${source===key ? 'text-sky-700 border-b-2 border-sky-600 font-bold' : 'text-slate-500'}`}>{label}</button>)}
          </div>
          <div id="shortcut-results" role="listbox" aria-label="단축어 검색 결과" className="max-h-60 overflow-y-auto">
            {filtered.map((sc,index) => <button type="button" role="option" aria-selected={index===active} id={`shortcut-option-${index}`} key={sc.id} disabled={isLoading}
              onClick={() => handleSelectShortcut(sc)} className={`w-full px-3 py-2 text-left hover:bg-sky-50 disabled:opacity-50 ${index===active ? 'bg-sky-50' : ''}`}>
              <span className="text-sm font-semibold text-slate-800">/{sc.name}</span><span className="ml-2 text-[10px] text-sky-700">{sc.source==='personal'?'나':'제작자'}</span>
              <p className="text-xs text-slate-500 break-words">{sc.desc}</p>
            </button>)}
            {!filtered.length && <p className="p-5 text-center text-sm text-slate-500">일치하는 단축어가 없습니다.</p>}
          </div>
          <button type="button" onClick={() => { setShowShortcutsMenu(false); onManageShortcuts(); }} className="w-full text-right px-4 py-2 border-t border-slate-100 text-sm text-sky-700">+ 단축어 추가 · 관리</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-2 focus-within:ring-2 focus-within:ring-sky-200">

        <input
          ref={inputRef}
          className="w-full min-w-0 bg-transparent text-gray-900 text-sm px-2 py-2 focus:outline-none placeholder-gray-500"
          value={inputText}
          placeholder={viewMode === 'novel' ? "대사/행동을 입력하거나 '/'를 눌러 단축어를 호출하세요..." : "메시지 보내기..."}
          onChange={handleInputChange}
          role="combobox"
          aria-label="채팅 입력"
          aria-expanded={showShortcutsMenu}
          aria-controls="shortcut-results"
          aria-autocomplete="list"
          aria-activedescendant={showShortcutsMenu && filtered.length ? `shortcut-option-${active}` : undefined}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) { if (e.key === 'Enter') e.preventDefault(); return; }
            if (e.key === 'Escape') { setShowShortcutsMenu(false); return; }
            if (showShortcutsMenu && filtered.length && ['ArrowDown','ArrowUp'].includes(e.key)) {
              e.preventDefault(); const next = (active + (e.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length; setSelected(next);
              document.getElementById(`shortcut-option-${next}`)?.scrollIntoView({ block:'nearest' });
            }
          }}
        />
        <div className="flex items-center justify-between gap-2 mt-1">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => insertToken('*')} aria-label="별표 두 개 입력" title="행동 입력" className="rounded-full border border-slate-200 p-1.5 text-slate-600 hover:bg-sky-50"><Asterisk className="w-4 h-4" /></button>
            <button type="button" onClick={() => insertToken('/')} aria-label="단축어 입력" className="rounded-full border border-slate-200 p-1.5 text-sky-700 hover:bg-sky-50"><Slash className="w-4 h-4" /></button>
            <button type="button" disabled={isLoading || generating} onClick={generateReplies} className="flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-sky-50 disabled:opacity-50"><ListPlus className="w-4 h-4" />{generating ? '생성 중…' : '추천답변'}</button>
          </div>
        <button
          type={isGenerating ? "button" : "submit"}
          onClick={isGenerating ? onStop : undefined}
          disabled={isGenerating ? isStopping : isLoading}
          aria-label={isGenerating ? (isStopping ? "중단 중" : "생성 중단") : inputText.trim() ? "메시지 보내기" : "이어서 진행"}
          title={isGenerating ? "생성 중단" : inputText.trim() ? "메시지 보내기" : "입력 없이 이야기를 이어가요"}
          className="p-3 bg-gradient-to-r from-sky-600 to-blue-600 hover:opacity-90 disabled:opacity-40 text-white rounded-full transition shadow-lg shrink-0"
        >
          {isGenerating ? <Square className="w-5 h-5" fill="currentColor" /> : <Send className="w-5 h-5" />}
        </button>
        </div>
      </form>
    </footer>
  );
}
