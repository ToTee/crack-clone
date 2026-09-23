'use client';
import StoryMarkdown from '@/components/StoryMarkdown';
export type DescriptionImages = Record<string, { url: string; name: string }>;
export default function DescriptionContent({ text, images = {} }: { text: string; images?: DescriptionImages }) {
  return <div className="text-sm leading-7"><StoryMarkdown content={text} descriptionImages={images} /></div>;
}
