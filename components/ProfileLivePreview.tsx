'use client';
import { usePreviewProfile } from '@/lib/use-preview-profile';
import DescriptionContent from './DescriptionContent';
import { ImageIcon } from 'lucide-react';
import { getPromptTemplate } from '@/lib/prompt-templates';
import PreviewNovelView from './PreviewNovelView';
import type { Registration } from './RegistrationFields';

export default function ProfileLivePreview({ image, name, tagline, registration: r, template, prologue, mediaList }: {
  image: string; name: string; tagline: string; registration: Registration;
  template: string; prologue: string; mediaList: any[];
}) {
  const { display, error } = usePreviewProfile();
  const content = <div className="space-y-5 p-5 [overflow-wrap:anywhere]">
    {image ? <img src={image} alt="스토리 대표 이미지 미리보기" className="mx-auto aspect-[3/4] w-44 rounded-xl bg-slate-50 object-cover" /> : <div className="mx-auto flex aspect-[3/4] w-44 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><ImageIcon aria-label="대표 이미지 없음" className="h-12 w-12" /></div>}
    <div><h3 className="text-xl font-bold text-slate-900">{name || '스토리 이름'}</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-500">{tagline || '한 줄 소개가 여기에 표시돼요.'}</p></div>
    <div className="flex flex-wrap gap-2 text-xs text-slate-600">{[getPromptTemplate(template).title, r.genre, r.target, r.conversation, r.recommendedMode && `권장: ${r.recommendedMode}`, r.audience === 'adult' ? '성인 대상' : r.audience === 'all' ? '전체 이용자' : ''].filter(Boolean).map((item, i) => <span key={i} className="rounded-md border border-slate-200 px-2 py-1">{item}</span>)}</div>
    {r.hashtags.length > 0 && <p className="text-sm text-sky-700">{r.hashtags.map(t => `#${t}`).join(' ')}</p>}
    <section className="border-t border-slate-200 pt-4"><h4 className="mb-2 text-sm font-bold">상세 설명</h4><DescriptionContent text={r.description || '왼쪽에서 작성한 상세 설명이 바로 반영돼요.'} images={r.descriptionImages} /></section>
    <section className="border-t border-slate-200 pt-4"><h4 className="mb-3 text-sm font-bold">프롤로그 미리보기</h4>{error && <p role="alert" className="text-xs text-red-600">{error}</p>}{prologue ? <PreviewNovelView content={display(prologue)} name={name} mediaList={mediaList} /> : <p className="text-sm text-slate-400">시작 설정에서 첫 프롤로그를 작성해 주세요.</p>}</section>
  </div>;
  return <aside aria-label="프로필 실시간 미리보기" className="order-first min-w-0 lg:order-none lg:sticky lg:top-20 lg:self-start">
    <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white lg:block"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold">미리보기</h2><p className="mt-1 text-xs text-slate-500">작성 중인 내용이 실시간으로 반영돼요.</p></div><div className="max-h-[calc(100dvh-11rem)] overflow-y-auto overscroll-contain">{content}</div></div>
    <details className="rounded-2xl border border-sky-200 bg-white lg:hidden"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-sky-800">실시간 미리보기 펼치기</summary>{content}</details>
  </aside>;
}
