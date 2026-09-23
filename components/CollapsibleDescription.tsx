'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import DescriptionContent, { type DescriptionImages } from '@/components/DescriptionContent';

const COLLAPSED_HEIGHT = 224;

export default function CollapsibleDescription({ text, images }: { text: string; images?: DescriptionImages }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => { setExpanded(false); }, [text]);
  useEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () => setOverflows(element.getBoundingClientRect().height > COLLAPSED_HEIGHT + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, images]);

  function toggle() {
    if (expanded && section.current && section.current.getBoundingClientRect().top < 0) {
      section.current.scrollIntoView({ block: 'start' });
    }
    setExpanded(value => !value);
  }

  return <div ref={section} className="mt-3 scroll-mt-20">
    <div id={id} className="relative overflow-hidden" style={{ maxHeight: expanded ? undefined : COLLAPSED_HEIGHT }}>
      <div ref={content}><DescriptionContent text={text} images={images} /></div>
      {overflows && !expanded && <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-gray-50 to-transparent" />}
    </div>
    {overflows && <button type="button" onClick={toggle} aria-expanded={expanded} aria-controls={id} className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 focus-visible:outline-sky-600">
      {expanded ? '접기' : '더보기'}{expanded ? <ChevronUp aria-hidden="true" className="h-4 w-4" /> : <ChevronDown aria-hidden="true" className="h-4 w-4" />}
    </button>}
  </div>;
}
