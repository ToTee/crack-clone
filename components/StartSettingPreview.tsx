// components/StartSettingPreview.tsx
'use client';

import { prologueMedia, type ChatMedia } from '@/lib/chat-media';
import { usePreviewProfile } from '@/lib/use-preview-profile';
import { Eye } from 'lucide-react';
import PreviewNovelView from '@/components/PreviewNovelView';
import { StartSettingItem } from '@/components/StartSettingTab';

interface Props {
  mediaList?: ChatMedia[];
  currentSetting: StartSettingItem;
  image?: string;
  name?: string;
}

export default function StartSettingPreview({ currentSetting, name = '', mediaList = [] }: Props) {
  const { display, error } = usePreviewProfile();
  return (
    <div className="hidden lg:block lg:col-span-5 sticky top-20">
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between border-b border-gray-200 pb-2.5">
          <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-sky-600" />
            실시간 씬 미리보기 ({currentSetting.name?.trim() || currentSetting.label})
          </span>
          <span className="text-[10px] bg-sky-500/10 text-sky-600 border border-sky-500/20 px-2 py-0.5 rounded-full font-medium">
            스토리 모드
          </span>
        </div>

        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5 h-[calc(100dvh-12rem)] min-h-[380px] overflow-y-auto">
          {error && <p role="alert" className="mb-2 text-xs text-red-600">{error}</p>}
          <PreviewNovelView
            mediaList={prologueMedia(mediaList, currentSetting.id)}
            content={display(currentSetting.prologue)}
            name={name}
            playGuide={display(currentSetting.playGuide)}
            suggestedReplies={currentSetting.suggestedReplies.map(display)}
          />
        </div>
      </div>
    </div>
  );
}
