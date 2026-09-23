// components/CreateTypeModal.tsx
'use client';

import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

interface CreateTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateTypeModal({ isOpen, onClose }: CreateTypeModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const handleSelect = (type: 'story' | 'character') => {
    onClose();
    router.push(`/create?type=${type}`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fadeIn">
      {/* 👇 사진 속 와이드 화이트 모달 카드 (max-w-2xl 가로 2열 배치) */}
      <div className="bg-white text-gray-900 rounded-3xl w-full max-w-2xl p-6 sm:p-7 shadow-2xl space-y-6 relative">
        
        {/* 상단 헤더 */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-gray-900">작품 만들기</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-800 rounded-full hover:bg-gray-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 👇 사진처럼 가로로 2개 나란히 배치 (grid-cols-1 sm:grid-cols-2) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          
          {/* 1. 스토리 선택 카드 */}
          <div
            onClick={() => handleSelect('story')}
            className="group cursor-pointer rounded-2xl overflow-hidden border border-gray-200 hover:border-gray-400 hover:shadow-xl transition-all duration-300 bg-white flex flex-col"
          >
            {/* 이미지 영역 (16:9 와이드 비율로 사진 안 잘리게 최적화) */}
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-gray-100 rounded-t-2xl">
              <img
                src="/story_thumb.png"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80';
                }}
                alt="Story Thumbnail"
                className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />
              

            </div>

            {/* 하단 텍스트 설명 */}
            <div className="p-5 text-center space-y-1.5 flex-1 flex flex-col justify-center">
              <h3 className="font-bold text-lg text-gray-900 group-hover:text-sky-600 transition">스토리</h3>
              <p className="text-xs text-gray-600 font-medium">한 편의 이야기를 설계해 보세요.</p>
              <p className="text-[11.5px] text-gray-500">완성된 작품은 스토리 홈에 공유돼요.</p>
            </div>
          </div>

          {/* 2. 캐릭터 선택 카드 */}
          <div
            onClick={() => handleSelect('character')}
            className="group cursor-pointer rounded-2xl overflow-hidden border border-gray-200 hover:border-gray-400 hover:shadow-xl transition-all duration-300 bg-white flex flex-col"
          >
            {/* 이미지 영역 (얼굴이 안 잘리도록 object-top 최적화) */}
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-gray-100 rounded-t-2xl">
              <img
                src="/char_thumb.png"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80';
                }}
                alt="Character Thumbnail"
                className="w-full h-full object-cover object-top group-hover:scale-105 transition duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />

              {/* 캐릭터 카카오톡/DM 말풍선 프리뷰 (사진 속 UI 재현) */}
              <div className="absolute bottom-3 left-3 right-3 space-y-1.5">
                <div className="inline-block bg-white text-gray-900 text-[11px] px-3 py-1.5 rounded-2xl rounded-tl-none font-medium shadow-md">
                  지금 뭐해? 같이 걷고 싶어.
                </div>
                <div className="flex justify-end">
                  <div className="inline-block bg-gray-100 text-gray-800 text-[11px] px-3 py-1.5 rounded-2xl rounded-br-none font-medium shadow-md border border-gray-200">
                    조금만 기다려. 금방 갈게.
                  </div>
                </div>
              </div>
            </div>

            {/* 하단 텍스트 설명 */}
            <div className="p-5 text-center space-y-1.5 flex-1 flex flex-col justify-center">
              <h3 className="font-bold text-lg text-gray-900 group-hover:text-blue-600 transition">캐릭터</h3>
              <p className="text-xs text-gray-600 font-medium">빠르게 나만의 캐릭터를 만들어요.</p>
              <p className="text-[11.5px] text-gray-500">완성된 캐릭터는 캐릭터 홈에 공유돼요.</p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
