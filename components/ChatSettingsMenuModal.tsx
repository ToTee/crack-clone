// components/ChatSettingsMenuModal.tsx
'use client';

import { useState } from 'react';
import { 
  BookOpen, MessageCircle, X, 
  Compass, 
  UserCircle, 
  FileText, 
  Sliders, 
  Clock, 
  Command, 
  Type, 
  Image as ImageIcon 
} from 'lucide-react';
import MemoryModal from '@/components/MemoryModal';
import ChatContentModal from '@/components/ChatContentModal';

import LiveStarBalance, { type BalanceState } from '@/components/LiveStarBalance';

interface Props {
  starBalance: BalanceState;
  viewMode: 'novel' | 'chat';
  setViewMode: (v: 'novel' | 'chat') => void;
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenProfile: () => void;
  onOpenShortcuts: () => void;
  onOpenUserNote: () => void;
  onOpenSystemSettings: () => void;
  showMedia: boolean;
  mediaSettingDisabled?: boolean;
  setShowMedia: (v: boolean) => void;
  playGuideContent?: string;
}

export default function ChatSettingsMenuModal({
  starBalance,
  viewMode, setViewMode,
  sessionId,
  isOpen,
  onClose,
  onOpenProfile,
  onOpenShortcuts,
  onOpenUserNote,
  onOpenSystemSettings,
  showMedia,
  mediaSettingDisabled = false,
  setShowMedia,
  playGuideContent = '',
}: Props) {
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState<string | React.ReactNode>('');
  const [isContentModalOpen, setIsContentModalOpen] = useState(false);

  const openPopup = (title: string, content: string | React.ReactNode) => {
    setModalTitle(title);
    setModalContent(content);
    setIsContentModalOpen(true);
  };

  if (!isOpen && !isContentModalOpen && !memoryOpen) return null;

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-xs max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 shadow-2xl space-y-4 text-gray-900 relative animate-fadeIn">
            
            {/* 상단 헤더 */}
            <div className="flex items-center justify-between border-b border-gray-200 pb-2.5">
              <h3 className="font-bold text-sm text-gray-600">채팅방 설정</h3>
              <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-900 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <LiveStarBalance value={starBalance} />

            {/* 메뉴 목록 */}
            <div className="space-y-1 text-xs">
              
              <div role="group" aria-label="대화 표시 방식" className="flex gap-1 rounded-xl bg-gray-100 p-1 mb-3">
                <button type="button" aria-pressed={viewMode === 'novel'} onClick={() => setViewMode('novel')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 font-medium transition ${viewMode === 'novel' ? 'bg-sky-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'}`}>
                  <BookOpen className="w-4 h-4" />스토리
                </button>
                <button type="button" aria-pressed={viewMode === 'chat'} onClick={() => setViewMode('chat')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 font-medium transition ${viewMode === 'chat' ? 'bg-sky-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'}`}>
                  <MessageCircle className="w-4 h-4" />채팅
                </button>
              </div>
              {/* 1. 플레이 가이드 */}
              <button
                type="button"
                onClick={() => {
                  openPopup(
                    '플레이 가이드',
                    playGuideContent.trim()
                      ? playGuideContent
                      : "유저는 정해진 설정 없이 자유롭게 시작할 수 있습니다!\n대화 프로필이나 유저 노트를 이용해 설정을 정하고 시작해 보세요 :)"
                  );
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-gray-700 transition text-left"
              >
                <Compass className="w-4 h-4 text-gray-500" />
                <span>플레이 가이드</span>
              </button>

              {/* 2. 대화 프로필 */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenProfile();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-gray-700 transition text-left"
              >
                <UserCircle className="w-4 h-4 text-gray-500" />
                <span>대화 프로필</span>
              </button>

              {/* 3. 유저 노트 */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenUserNote();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-gray-700 transition text-left"
              >
                <FileText className="w-4 h-4 text-gray-500" />
                <span>유저 노트</span>
              </button>

              {/* 4. 최대 출력량 조절 */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSystemSettings();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-gray-700 transition text-left"
              >
                <Sliders className="w-4 h-4 text-gray-500" />
                <span>최대 출력량 조절</span>
              </button>

              {/* 5. 요약 메모리 */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  setMemoryOpen(true);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-gray-700 transition text-left"
              >
                <Clock className="w-4 h-4 text-gray-500" />
                <span>요약 메모리</span>
              </button>

              <button type="button" onClick={() => { onClose(); onOpenShortcuts(); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sky-50 text-gray-700 text-left"><Command className="w-4 h-4 text-gray-500" /><span>단축어</span></button>
              {/* 6. 키보드 단축키 */}
              <button
                type="button"
                onClick={() => {
                  openPopup(
                    '키보드 단축키 안내',
                    '• Enter : 메시지 및 대사 전송\n• Shift + Enter : 줄바꿈(엔터)\n• / 입력 : 등록된 단축어 메뉴 호출 및 입력창에 삽입\n• Esc : 열려있는 팝업 닫기'
                  );
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-gray-700 transition text-left"
              >
                <Command className="w-4 h-4 text-gray-500" />
                <span>키보드 단축키</span>
              </button>
            </div>

            {/* 전체 설정 섹션 */}
            <div className="pt-2 border-t border-gray-200 space-y-2 text-xs">
              <div className="text-[11px] font-bold text-gray-500 px-1">전체 설정</div>
              
              <div className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/5 text-gray-700 transition">
                <div className="flex items-center gap-3">
                  <Type className="w-4 h-4 text-gray-500" />
                  <span>글꼴</span>
                </div>
                <span className="text-[11px] text-gray-500">기본</span>
              </div>

              <div className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/5 text-gray-700 transition">
                <div className="flex items-center gap-3">
                  <ImageIcon className="w-4 h-4 text-gray-500" />
                  <span>상황 이미지 보기</span>
                </div>
                <button
                  type="button"
                  disabled={mediaSettingDisabled}
                  role="switch"
                  aria-label="상황 이미지 보기"
                  aria-checked={showMedia}
                  onClick={() => setShowMedia(!showMedia)}
                  className={`w-9 h-5 rounded-full transition-colors relative ${
                    showMedia ? 'bg-sky-600' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform absolute top-[3px] ${
                      showMedia ? 'left-[19px]' : 'left-[3px]'
                    }`}
                  />
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {memoryOpen && <MemoryModal sessionId={sessionId} onClose={() => setMemoryOpen(false)} />}
      {/* 팝업 모달 */}
      <ChatContentModal
        isOpen={isContentModalOpen}
        onClose={() => setIsContentModalOpen(false)}
        title={modalTitle}
        content={modalContent}
      />
    </>
  );
}
