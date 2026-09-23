// components/ProfileTab.tsx
'use client';
import { readUploadImage } from '@/lib/image-upload';

import { useRef, useState, useEffect } from 'react';
import RegistrationFields, { type Registration } from './RegistrationFields';
import { Upload, Trash2, Sparkles, Loader2 } from 'lucide-react';

interface Props {
  registration: Registration;
  setRegistration: (value: Registration) => void;
  image: string;
  setImage: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  tagline: string;
  setTagline: (v: string) => void;
}

export default function ProfileTab({
  registration, setRegistration,
  image,
  setImage,
  name,
  setName,
  tagline,
  setTagline,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!image) {
      setDimensions(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setDimensions({ width: img.width, height: img.height });
    };
    img.src = image;
  }, [image]);

  const handleBoxClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('이미지 파일(JPG, PNG, WebP 등)만 업로드할 수 있습니다.');
      return;
    }

    readUploadImage(file).then(setImage).catch(error => alert(error.message));
  };

  // AI 랜덤 프로필 생성
  const handleAiRandomGenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);

    try {
      const res = await fetch('/api/generate-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (data.name && data.tagline) {
        setName(data.name);
        setTagline(data.tagline);
        setImage(data.image || '');
      } else {
        alert('AI 생성 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (e: any) {
      alert('오류 발생: ' + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 상단 AI 랜덤 생성 배너 */}
      <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-xs text-gray-500 flex items-center justify-between shadow-sm">
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-sky-600" />
          AI가 참신한 스토리 프로필을 실시간으로 구상합니다
        </span>
        <button
          type="button"
          onClick={handleAiRandomGenerate}
          disabled={isGenerating}
          className="text-xs text-[#3679a8] hover:text-[#28638e] font-bold flex items-center gap-1.5 transition active:scale-95 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> AI 구상 중...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" /> AI 랜덤 생성
            </>
          )}
        </button>
      </div>

      {/* 이미지 업로드 영역 */}
      <div className="space-y-2">
        <label className="block text-xs font-bold text-gray-700">
          이미지 <span className="text-[#3679a8]">*</span>
        </label>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="flex gap-4 items-start">
          {/* 👇 600 x 600 px 대응 1:1 정사각 업로드 박스 (w-32 h-32) */}
          <div
            onClick={handleBoxClick}
            className="group w-32 h-32 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-300 hover:border-[#3679a8] overflow-hidden flex flex-col items-center justify-center relative shrink-0 cursor-pointer transition shadow-md aspect-square"
            title="클릭하여 사진 업로드"
          >
            {image ? (
              <>
                <img src={image} alt="Profile Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center text-[10px] text-white">
                  <Upload className="w-5 h-5 mb-1 text-sky-600" />
                  <span>사진 변경</span>
                </div>
              </>
            ) : (
              <div className="text-center p-2 group-hover:scale-105 transition">
                <Upload className="w-7 h-7 text-gray-500 group-hover:text-[#3679a8] mx-auto mb-1.5 transition" />
                <span className="text-[11px] font-medium text-gray-500 group-hover:text-gray-900">이미지 업로드</span>
              </div>
            )}
          </div>

          <div className="space-y-2.5 flex-1 pt-1">
            <p className="text-xs text-gray-500 leading-relaxed">
              박스를 클릭하여 <span className="text-gray-900 font-semibold">내 컴퓨터/스마트폰 사진</span>을 직접 업로드하세요.
            </p>

            {/* 👇 600 × 600 px 권장 사이즈 표기 */}
            <div className="bg-white border border-gray-100 rounded-xl px-3.5 py-2.5 text-[11px] text-gray-500 space-y-1">
              <div className="flex items-center justify-between">
                <span>권장 사이즈</span>
                <span className="text-gray-700 font-medium">1 : 1 비율 (600 × 600 px)</span>
              </div>
              {dimensions && (
                <div className="flex items-center justify-between border-t border-gray-100 pt-1 text-sky-600 font-medium">
                  <span>현재 이미지 크기</span>
                  <span>{dimensions.width} × {dimensions.height} px</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleBoxClick}
                className="px-3 py-1.5 bg-gray-200 hover:bg-gray-200 border border-gray-200 rounded-lg text-xs text-gray-700 font-medium transition"
              >
                사진 찾아보기
              </button>

              {image && (
                <button
                  type="button"
                  onClick={() => setImage('')}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 px-2 py-1.5 rounded-lg hover:bg-red-500/10 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" /> 삭제
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 이름 */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <label className="text-xs font-bold text-gray-700">
            이름 <span className="text-[#3679a8]">*</span>
          </label>
          <span className="text-[11px] text-gray-500">{name.length} / 30</span>
        </div>
        <input
          maxLength={30}
          placeholder="스토리의 이름을 입력해 주세요"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-[#3679a8]"
        />
        <p className="text-[11px] text-gray-500">2~30자 이내로 입력해 주세요</p>
      </div>

      {/* 한 줄 소개 */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <label className="text-xs font-bold text-gray-700">
            한 줄 소개 <span className="text-[#3679a8]">*</span>
          </label>
          <span className="text-[11px] text-gray-500">{tagline.length} / 30</span>
        </div>
        <input
          maxLength={30}
          placeholder="어떤 스토리인지 설명할 수 있는 간단한 소개"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-[#3679a8]"
        />
      </div>
      <RegistrationFields value={registration} onChange={setRegistration} />
    </div>
  );
}
