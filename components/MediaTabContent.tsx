// components/MediaTabContent.tsx
'use client';
import { readUploadImage } from '@/lib/image-upload';

import { useState, useRef } from 'react';
import { CheckCircle2, ChevronRight, X } from 'lucide-react';
import MediaGridPreview from '@/components/MediaGridPreview';
import MediaDetailList from '@/components/MediaDetailList';
import { parseMediaFilename } from '@/lib/media-layout';
import MediaHelpModal from '@/components/MediaHelpModal';

export interface MediaItem {
  id: string;
  name: string;
  title?: string;
  sizeBytes?: number;
  url: string;
  targetScope: 'all' | 'default' | 'extra1' | 'extra2';
  category?: string;
  situation?: string;
  hint?: string;
  memo?: string;
}

interface Props {
  startSettings?: { id: number; name: string; label: string }[];
  mediaList: MediaItem[];
  setMediaList: React.Dispatch<React.SetStateAction<MediaItem[]>>;
}

const MAX_IMAGES = 2000;

export default function MediaTabContent({ mediaList = [], setMediaList, startSettings = [] }: Props) {
  const settingNames = { all: '전체', ...Object.fromEntries(
    ['default', 'extra1', 'extra2'].map((scope, index) => {
      const setting = startSettings.find(item => item.id === index);
      return [scope, setting?.name?.trim() || setting?.label || (index === 0 ? '기본 설정' : `추가 설정 ${index}`)];
    })
  ) } as Record<string, string>;
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 1: 이미지 업로드, 2: 이미지 세부 설정
  const [subStep, setSubStep] = useState<1 | 2>(1);
  
  const [selectedSettingFilter, setSelectedSettingFilter] = useState<'all' | 'default' | 'extra1' | 'extra2'>('all');
  const [targetScope, setTargetScope] = useState<'all' | 'default' | 'extra1' | 'extra2'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showTip, setShowTip] = useState(true);
  const [showHelp, setShowHelp] = useState(false);

  const uploadingRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleBoxClick = () => {
    if (uploadingRef.current) return;
    if (mediaList.length >= MAX_IMAGES) {
      alert(`이미지는 최대 ${MAX_IMAGES}장까지만 업로드할 수 있습니다.`);
      return;
    }
    fileInputRef.current?.click();
  };

  const uploadFiles = async (files: File[]) => {
    if (uploadingRef.current) return;
    const images = files.filter(file => file.type.startsWith('image/'));
    if (!images.length) { alert('이미지 파일을 선택해 주세요.'); return; }
    const remaining = Math.max(0, MAX_IMAGES - mediaList.length);
    if (!remaining) { alert('이미지는 작품당 최대 2,000장까지 등록할 수 있습니다.'); return; }
    if (images.length > remaining) alert(`남은 ${remaining}장만 업로드합니다. 작품당 최대 2,000장까지 등록할 수 있습니다.`);
    uploadingRef.current = true;
    setUploading(true);
    let failed = 0;
    try {
      await Promise.all(images.slice(0, remaining).map(async file => {
        try {
          const url = await readUploadImage(file);
          if (!url) { failed++; return; }
          const { category, situation } = parseMediaFilename(file.name);
          const item: MediaItem = {
            id: crypto.randomUUID(), name: file.name, url, targetScope,
            category, situation, hint: '', memo: '',
          };
          setMediaList(prev => prev.length < MAX_IMAGES ? [...prev, item] : prev);
        } catch { failed++; }
      }));
      if (failed) alert(`${failed}장의 사진을 읽지 못했습니다. 다시 업로드해 주세요.`);
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length) void uploadFiles(files);
  };

  const handleDeleteMedia = (id: string) => {
    setMediaList((prev) => prev.filter((m) => m.id !== id));
  };

  const countDefault = mediaList.filter((m) => m.targetScope === 'default').length;
  const countExtra1 = mediaList.filter((m) => m.targetScope === 'extra1').length;
  const countExtra2 = mediaList.filter((m) => m.targetScope === 'extra2').length;

  const filteredMedia = mediaList.filter((m) => {
    const matchSetting = (m.targetScope || 'all') === selectedSettingFilter;
    if (!matchSetting) return false;
    if (!searchQuery.trim()) return true;
    return (
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.situation?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
    {showHelp && <MediaHelpModal onClose={() => setShowHelp(false)} />}
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-4 min-w-0 space-y-5">
        
        {/* 상단 안내 & 추가 버튼 */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-gray-700">상황 이미지</h3>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
              작품에 어울리는 이미지를 등록해 보세요.<br />
              AI가 분류와 상황에 맞게 자동으로 이미지를 띄워드려요.
            </p>
            <button type="button" onClick={() => setShowHelp(true)} className="text-[11px] text-gray-500 hover:text-gray-900 flex items-center gap-0.5 mt-1">
              자세히 보기 <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleBoxClick}
            disabled={mediaList.length >= MAX_IMAGES}
            className="px-3.5 py-1.5 bg-[#3679a8] hover:bg-[#28638e] disabled:opacity-40 text-white rounded-lg text-xs font-bold transition shadow-sm"
          >
            이미지 추가
          </button>
        </div>

        {/* 상단 알약 필터 탭 */}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setSelectedSettingFilter('all'); setTargetScope('all'); }} className={`px-4 py-1.5 rounded-full text-xs font-semibold ${selectedSettingFilter === 'all' ? 'bg-sky-500 text-white border border-gray-300 shadow' : 'bg-gray-50 text-gray-500'}`}>전체 {mediaList.filter(m => !m.targetScope || m.targetScope === 'all').length}</button>
          <button
            type="button"
            onClick={() => { setSelectedSettingFilter('default'); setTargetScope('default'); }}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${
              selectedSettingFilter === 'default'
                ? 'bg-sky-500 text-white border border-gray-300 shadow'
                : 'bg-gray-50 text-gray-500 hover:text-gray-700'
            }`}
          >
            {settingNames.default} {countDefault}
          </button>
          <button
            type="button"
            onClick={() => { setSelectedSettingFilter('extra1'); setTargetScope('extra1'); }}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${
              selectedSettingFilter === 'extra1'
                ? 'bg-sky-500 text-white border border-gray-300 shadow'
                : 'bg-gray-50 text-gray-500 hover:text-gray-700'
            }`}
          >
            {settingNames.extra1} {countExtra1}
          </button>
          <button
            type="button"
            onClick={() => { setSelectedSettingFilter('extra2'); setTargetScope('extra2'); }}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${
              selectedSettingFilter === 'extra2'
                ? 'bg-sky-500 text-white border border-gray-300 shadow'
                : 'bg-gray-50 text-gray-500 hover:text-gray-700'
            }`}
          >
            {settingNames.extra2} {countExtra2}
          </button>
        </div>

        {/* 탭 전환 바 (1. 이미지 업로드 ↔ 2. 이미지 세부 설정) */}
        <div className="flex items-center bg-gray-50 rounded-xl p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setSubStep(1)}
            className={`flex-1 text-center py-2 rounded-lg transition ${
              subStep === 1
                ? 'bg-gray-100 text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            1. 이미지 업로드
          </button>
          <button
            type="button"
            onClick={() => setSubStep(2)}
            className={`flex-1 text-center py-2 rounded-lg transition ${
              subStep === 2
                ? 'bg-gray-100 text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            2. 이미지 세부 설정
          </button>
        </div>

        {/* 1단계 화면: 이미지 업로드 */}
        {subStep === 1 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 block">이미지 적용 범위</label>
              <p className="text-[11px] text-gray-500">업로드할 이미지가 적용될 시작 설정을 선택하세요.</p>
              <select
                value={targetScope}
                onChange={(e) => { setTargetScope(e.target.value as any); setSelectedSettingFilter(e.target.value as any); }}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs text-gray-900 focus:outline-none focus:border-[#3679a8]"
              >
                <option value="all">전체 (모든 시작 설정에 적용)</option>
                <option value="default">{settingNames.default}에만 적용</option>
                <option value="extra1">{settingNames.extra1}에만 적용</option>
                <option value="extra2">{settingNames.extra2}에만 적용</option>
              </select>
            </div>

            {showTip && (
              <div className="bg-gray-50 border border-blue-500/20 rounded-xl p-3.5 text-[11px] text-gray-600 relative space-y-1">
                <button
                  type="button"
                  onClick={() => setShowTip(false)}
                  className="absolute top-2.5 right-2.5 text-gray-500 hover:text-gray-900"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <p className="font-bold text-blue-400 flex items-center gap-1">
                  ⓘ 파일 이름은 이렇게 작성해 주세요!
                </p>
                <p className="text-gray-500 leading-relaxed">
                  언더바(_) 앞의 글자는 분류, 뒤의 글자는 상황으로 자동 분류됩니다.<br />
                  ex) 에리_기쁨.jpg → 분류: 에리 / 상황: 기쁨
                </p>
              </div>
            )}



            <div
              onClick={handleBoxClick}
              onDragOver={event => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = uploading ? 'none' : 'copy'; setDragActive(!uploading); }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }}
              onDrop={event => { event.preventDefault(); event.stopPropagation(); setDragActive(false); if (!uploadingRef.current) void uploadFiles(Array.from(event.dataTransfer.files)); }}
              aria-busy={uploading}
              className={`border-2 border-dashed rounded-2xl p-8 text-center space-y-3 transition group ${uploading ? 'cursor-wait' : 'cursor-pointer'} ${dragActive ? 'border-sky-500 bg-sky-50' : 'border-gray-300 hover:border-[#3679a8] bg-gray-50'}`}
            >
              <div className="w-12 h-12 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 flex items-center justify-center mx-auto group-hover:scale-110 transition">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <div className="space-y-1">
                <h4 className="text-sm font-bold text-gray-900">
                  {uploading ? '사진을 업로드하고 있어요…' : dragActive ? '여기에 사진을 놓아주세요' : '이미지 업로드'}
                </h4>
                <p className="text-xs text-gray-500">
                  클릭해 기기의 사진을 선택하거나, 사진 파일을 이곳에 끌어다 놓으세요. (작품당 최대 2,000장)
                  {mediaList.length > 0 && <span className="mt-1 block">현재 {mediaList.length.toLocaleString()}장 등록됨</span>}
                </p>
              </div>

              <button
                type="button"
                disabled={uploading}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-xs font-semibold text-gray-700 rounded-xl transition"
              >
                {mediaList.length > 0 ? '이미지 추가 업로드' : '사진 찾아보기'}
              </button>
            </div>
          </div>
        )}

        {/* 2단계 화면: 이미지 세부 설정 (사진 리스트 + 아코디언 힌트/메모) */}
        {subStep === 2 && (
          <MediaDetailList
            mediaList={mediaList}
            setMediaList={setMediaList}
            selectedSettingFilter={selectedSettingFilter}
            onDelete={handleDeleteMedia}
          />
        )}

      </div>

      {/* 우측 이미지 배치표 */}
      <MediaGridPreview
        settingName={settingNames[selectedSettingFilter]}
        mediaList={mediaList}
        filteredMedia={filteredMedia}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedSettingFilter={selectedSettingFilter}
        onDelete={handleDeleteMedia}
        onDeleteSelected={ids => { const selected = new Set(ids); setMediaList(previous => previous.filter(item => !selected.has(item.id))); }}
        onClearAll={() => setMediaList([])}
      />

    </div>
    </>
  );
}
