'use client';
import { Children, isValidElement, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { resolveMedia, type ChatMedia } from '@/lib/chat-media';

// Work on parsed text only: never interpret media tags inside inline/fenced code.
export function sceneTags(options?: { descriptionOnly?: boolean }) {
  return (tree: any) => {
    const visit = (node: any) => {
      if (node.type === 'code') {
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, 'data-code-title': [node.lang, node.meta].filter(Boolean).join(' ') } };
        return;
      }
      if (!node.children || ['inlineCode', 'link', 'image', 'html'].includes(node.type)) return;
      node.children = node.children.flatMap((child: any) => {
        if (child.type !== 'text') { visit(child); return [child]; }
        const parts: any[] = [];
        const regex = options?.descriptionOnly ? /\{\{description-image:[a-zA-Z0-9-]+\}\}/g : /\{\{(?!user\}\}|char\}\})[^{}]+\}\}|\[이미지:\s*[^\]]+\]/g;
        let cursor = 0;
        for (const match of child.value.matchAll(regex)) {
          if (match.index > cursor) parts.push({ type: 'text', value: child.value.slice(cursor, match.index) });
          parts.push({ type: 'image', url: '/__story_scene__', alt: match[0], data: { hProperties: { 'data-scene-tag': match[0] } } });
          cursor = match.index + match[0].length;
        }
        if (!cursor) return [child];
        if (cursor < child.value.length) parts.push({ type: 'text', value: child.value.slice(cursor) });
        return parts;
      });
    };
    visit(tree);
  };
}

function CodeBlock({ children }: { children?: React.ReactNode }) {
  const code = Children.toArray(children).find(isValidElement) as React.ReactElement<any> | undefined;
  const value = String(code?.props.children ?? '');
  const label = code?.props['data-code-title'] || code?.props.className?.replace(/^language-/, '') || '코드';
  return <section className="my-4 min-w-0 max-w-full overflow-hidden rounded-xl border border-stone-600 bg-stone-900 text-white">
    <div className="flex justify-between items-center gap-3 bg-stone-700 px-4 py-2 text-sm"><span>{String(label).toUpperCase() === 'INFO' ? '상태창' : label}</span><button type="button" onClick={() => void navigator.clipboard?.writeText(value.replace(/\n$/, ''))} className="text-xs px-2 py-1">복사</button></div>
    <pre className="min-w-0 max-w-full whitespace-pre-wrap [overflow-wrap:anywhere] p-4 text-sm leading-relaxed">{children}</pre>
  </section>;
}

export default function StoryMarkdown({ content, mediaList = [], showImages = true, descriptionImages }: { content: string; mediaList?: ChatMedia[]; showImages?: boolean; descriptionImages?: Record<string, {url:string; name:string}> }) {
  const plugins = useMemo(() => [remarkGfm, remarkBreaks, () => sceneTags({descriptionOnly: descriptionImages !== undefined})], [descriptionImages !== undefined]);
  return <div className="min-w-0 whitespace-normal [overflow-wrap:anywhere] space-y-3 [&_p]:my-3 [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_h4]:text-base [&_h5]:text-sm [&_h6]:text-xs [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-bold [&_h4]:font-bold [&_h5]:font-bold [&_h6]:font-bold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_blockquote]:border-l-4 [&_blockquote]:border-sky-400 [&_blockquote]:pl-4 [&_blockquote]:text-slate-600 [&_hr]:my-5 [&_hr]:border-slate-300 [&_strong]:font-bold [&_del]:line-through [&_a]:text-sky-700 [&_a]:underline [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_code]:bg-slate-100 [&_code]:rounded [&_code]:px-1 [&_input]:mr-2">
    <ReactMarkdown remarkPlugins={plugins} components={{
      em: ({ children }) => <em style={{ fontStyle: 'normal', color: '#8C8C8C', WebkitTextStrokeWidth: 0 }}>{children}</em>,
      pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
      table: ({ children }) => <div className="max-w-full overflow-x-auto"><table className="border-collapse w-full text-sm my-3">{children}</table></div>,
      th: ({ children, style }) => <th style={style} className="border border-slate-300 bg-slate-100 px-3 py-2 font-bold">{children}</th>,
      td: ({ children, style }) => <td style={style} className="border border-slate-300 px-3 py-2">{children}</td>,
      a: ({ children, href }) => <a href={href} target={href?.startsWith('#') ? undefined : '_blank'} rel="noopener noreferrer">{children}</a>,
      img: ({ node, src, alt, title }) => {
        if (!showImages) return null;
        const tag = node?.properties?.['data-scene-tag'];
        if (descriptionImages !== undefined && typeof tag === 'string') {
          const key = /^\{\{description-image:([a-zA-Z0-9-]+)\}\}$/.exec(tag)?.[1];
          const image = key ? descriptionImages[key] : undefined;
          if (!image || !(/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(image.url) || /^\/api\/characters\/[^/]+\/description-image\/[^/?#]+$/.test(image.url))) return <span className="text-slate-400">[사진을 불러올 수 없습니다]</span>;
          return <img src={image.url} alt={image.name || '상세 설명 사진'} loading="lazy" className="my-3 block h-auto max-w-full rounded-xl" />;
        }
        const url = typeof tag === 'string' ? resolveMedia(tag, mediaList) : typeof src === 'string' ? src : null;
        if (!url) return null;
        return <img src={url} alt={typeof tag === 'string' ? '상황 이미지' : alt || ''} title={title} loading="lazy" className="block max-w-full h-auto rounded-xl my-3 border border-slate-200" />;
      },
    }}>{content}</ReactMarkdown>
  </div>;
}
