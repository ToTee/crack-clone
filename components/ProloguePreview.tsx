'use client';
import PreviewNovelView from '@/components/PreviewNovelView';
import { prologueMedia, replaceUserName, type ChatMedia } from '@/lib/chat-media';

export default function ProloguePreview({ setting, mediaList, name, profileName }: {
  setting: { id: number; prologue: string };
  mediaList: ChatMedia[];
  name: string;
  profileName?: string;
}) {
  // Formatting around an image reference must not turn it into literal text.
  const content = replaceUserName(setting.prologue, profileName)
    .replace(/\*{1,3}(\{\{[^{}]+\}\})\*{1,3}/g, '$1');
  return <PreviewNovelView content={content} name={name} mediaList={prologueMedia(mediaList, Number(setting.id ?? 0))} />;
}
