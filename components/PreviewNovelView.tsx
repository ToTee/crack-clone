// components/PreviewNovelView.tsx
'use client';

import StoryMarkdown from '@/components/StoryMarkdown';

interface MediaMapItem {
  id?: string;
  name: string;
  url: string;
  category?: string;
  situation?: string;
}

interface Props {
  content?: string;
  name?: string;
  playGuide?: string;
  suggestedReplies?: string[];
  mediaList?: MediaMapItem[];
  showImages?: boolean;
}

export default function PreviewNovelView({
  content = '',
  name = '',
  playGuide = '',
  suggestedReplies = [],
  mediaList = [],
  showImages = true,
}: Props) {
  return (
    <div
      className="space-y-3.5 text-[16px] font-normal leading-[1.9] text-gray-800"
      style={{ fontFamily: '"Malgun Gothic", "맑은 고딕", Arial, sans-serif', WebkitTextStroke: '0.1px currentColor' }}
    >
      {playGuide.trim() && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-[11.5px] text-blue-700 leading-relaxed">
          <span className="font-bold text-blue-700 block mb-0.5">📌 플레이 가이드</span>
          {playGuide}
        </div>
      )}

      {!content.trim() ? (
        <div className="text-gray-500 text-xs text-center py-8">
          프롤로그를 작성하면 이곳에 실제 웹소설처럼 실시간 렌더링됩니다.
        </div>
      ) : (
        <StoryMarkdown content={content} mediaList={mediaList} showImages={showImages} />
      )}

      {suggestedReplies.filter((r) => r && r.trim()).length > 0 && (
        <div className="pt-2 border-t border-gray-100 space-y-1.5">
          <span className="text-[10px] text-gray-500 font-bold block">추천 선택지 미리보기</span>
          <div className="flex flex-wrap gap-1.5">
            {suggestedReplies.filter((r) => r && r.trim()).map((reply, i) => (
              <span key={i} className="text-[11px] bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 border border-sky-500/30 px-2.5 py-1 rounded-full cursor-pointer">
                {reply}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
