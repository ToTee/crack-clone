'use client';

import { useEffect, useState } from 'react';
import { loadList, peekList, setList } from '@/lib/list-client';
import Link from 'next/link';
import { MessageSquare, Trash2, X } from 'lucide-react';

interface ChatSession {
  id: string;
  title: string;
  character_name: string;
  avatar: string;
  last_message?: string | null;
  updated_at: string;
  chat_count?: number;
  chat_count_baseline?: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onDeleted?: (id: string) => void;
}

export default function MyChatsSidebar({ isOpen, onClose, onDeleted }: Props) {
  const [chats, setChats] = useState<ChatSession[]>(() => peekList('/api/chats'));
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchChats = async () => {
    setLoading(true);
    try {
      setChats(await loadList('/api/chats'));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchChats();
  }, [isOpen]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`'${title}' 채팅을 삭제하시겠습니까?\n작품은 삭제되지 않습니다.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/chats/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('채팅 삭제에 실패했습니다.');
      setChats((current) => { const next = current.filter(chat => chat.id !== id); setList('/api/chats',next); return next; });
      onDeleted?.(id);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div onClick={onClose} className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
      <aside className="relative z-10 flex h-full w-80 flex-col border-r border-gray-200 bg-white text-gray-900 shadow-2xl sm:w-96">
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-sky-600" />
            <h2 className="text-base font-bold">내 채팅 목록 ({chats.length})</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="채팅 목록 닫기" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {loading && chats.length === 0 ? (
            <div className="py-20 text-center text-xs text-gray-500">채팅 목록 불러오는 중...</div>
          ) : chats.length === 0 ? (
            <div className="py-20 text-center text-xs text-gray-500">아직 시작한 채팅이 없습니다.</div>
          ) : (
            chats.map((chat) => (
              <div key={chat.id} className="group flex items-center rounded-2xl border border-gray-200 bg-white p-3 shadow-sm transition hover:border-sky-400">
                <Link href={`/chat/${chat.id}`} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3 pr-2">
                  <img src={chat.avatar} alt="" className="h-12 w-12 shrink-0 rounded-xl border border-gray-200 bg-gray-100 object-cover" />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-bold text-gray-900 transition group-hover:text-sky-600">{chat.character_name || chat.title}</h3>
                  </div>
                </Link>
                <div className="mr-3 shrink-0 text-center" title="답변 생성·재생성 요청 누적 수입니다. 삭제해도 유지되며 요약은 제외합니다. 실패·중단 요청도 포함되므로 과금 횟수와 다를 수 있습니다. *는 업데이트 전 남아 있던 메시지 수를 시작값으로 포함한 경우입니다.">
                  <div className="text-[10px] text-gray-500">누적 호출</div>
                  <div className="text-xs font-semibold tabular-nums text-sky-700">{typeof chat.chat_count === 'number' ? `${chat.chat_count.toLocaleString()}회${chat.chat_count_baseline ? '*' : ''}` : '—'}</div>
                </div>
                <button
                  type="button"
                  disabled={deletingId === chat.id}
                  onClick={() => handleDelete(chat.id, chat.character_name || chat.title)}
                  className="rounded-xl border border-gray-200 bg-gray-100 p-2 text-gray-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  title="이 채팅만 삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
