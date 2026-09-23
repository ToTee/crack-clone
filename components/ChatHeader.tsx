// components/ChatHeader.tsx
'use client';

import Link from 'next/link';
import { Sparkles, ChevronLeft, Menu, Settings } from 'lucide-react';
import { UserProfileItem } from '@/components/UserProfileModal';

import LiveStarBalance, { type BalanceState } from '@/components/LiveStarBalance';

interface Props {
  starBalance: BalanceState;
  character: any;
  activeUserProfile: UserProfileItem | null;
  onOpenChats: () => void;
  onOpenSettings: () => void;
  onOpenMenu: () => void;
}

export default function ChatHeader({
  starBalance,
  character,
  activeUserProfile,
  onOpenChats,
  onOpenSettings,
  onOpenMenu,
}: Props) {
  return (
    <header className="h-16 px-2 sm:px-5 bg-white border-b border-gray-200 flex items-center justify-between gap-2 shrink-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpenChats}
          aria-label="내 채팅 목록 열기"
          title="내 채팅 목록 열기"
          className="p-1 shrink-0 rounded-lg text-sky-600 hover:bg-sky-50 transition"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/" aria-label="홈으로 이동" title="홈으로 이동" className="p-1 shrink-0 rounded-lg text-sky-600 hover:bg-sky-50 transition">
          <Sparkles className="w-5 h-5" />
        </Link>
        <Link href="/" aria-label="메인으로 돌아가기" className="p-1 shrink-0 text-gray-500 hover:text-gray-900 transition">
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <div className="min-w-0">
          <h2 className="text-sm sm:text-base font-bold text-gray-900 truncate">{character.name}</h2>
          <p className="text-[11px] text-gray-500 truncate">
            {activeUserProfile ? `내 프로필: ${activeUserProfile.label}` : character.tagline}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <LiveStarBalance value={starBalance} />

        <button
          type="button"
          onClick={onOpenSettings}
          className="p-2 bg-white hover:bg-gray-200 border border-gray-200 text-gray-600 hover:text-gray-900 rounded-xl transition"
          title="AI 설정" aria-label="AI 설정"
        >
          <Settings className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onOpenMenu}
          className="p-2 bg-white hover:bg-gray-200 border border-gray-200 text-gray-600 hover:text-gray-900 rounded-xl transition relative"
          title="채팅방 설정" aria-label="채팅방 설정"
        >
          <svg className="w-4 h-4 fill-current text-gray-600" viewBox="0 0 24 24">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      </div>
    </header>
  );
}
