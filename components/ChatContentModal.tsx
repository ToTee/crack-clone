// components/ChatContentModal.tsx
'use client';

import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string | React.ReactNode;
}

export default function ChatContentModal({ isOpen, onClose, title, content }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white text-gray-900 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-5 animate-fadeIn relative">
        
        {/* 상단 헤더 */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 tracking-tight">{title}</h3>
          <button 
            onClick={onClose} 
            className="p-1 text-gray-500 hover:text-gray-900 rounded-full hover:bg-gray-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 👇 사진 속 회색 스크롤 본문 박스 */}
        <div className="bg-[#f4f4f6] rounded-2xl p-4 min-h-[220px] max-h-[380px] overflow-y-auto text-sm leading-relaxed text-gray-800 font-normal space-y-2 whitespace-pre-wrap">
          {content}
        </div>

        {/* 👇 사진 속 우측 하단 검은색 [확인] 버튼 */}
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-gray-100 hover:bg-sky-500 text-white text-xs font-bold rounded-xl transition shadow"
          >
            확인
          </button>
        </div>

      </div>
    </div>
  );
}
