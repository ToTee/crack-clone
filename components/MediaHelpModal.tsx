'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, ImageIcon, Smile, X } from 'lucide-react';

export default function MediaHelpModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  const example = (happy = false) => (
    <div className={`flex aspect-square items-center justify-center rounded-2xl ${happy ? 'bg-amber-50 text-amber-500' : 'bg-sky-50 text-sky-500'}`}>
      {happy ? <Smile className="h-14 w-14 sm:h-20 sm:w-20" strokeWidth={1.5} /> : <ImageIcon className="h-14 w-14 sm:h-20 sm:w-20" strokeWidth={1.5} />}
    </div>
  );

  return (
    <dialog ref={dialogRef} aria-labelledby="media-help-title" onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); setPage(0); }
        if (event.key === 'ArrowRight') { event.preventDefault(); setPage(1); }
      }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-3xl bg-white p-0 text-gray-900 shadow-2xl backdrop:bg-black/40">
      <div className="p-4 sm:p-6">
        <header className="flex items-center justify-between">
          <h2 id="media-help-title" className="text-xl font-bold">상황 이미지</h2>
          <button type="button" autoFocus onClick={onClose} aria-label="안내 닫기" className="rounded-full p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </header>
        <div className="relative my-7 px-6 sm:my-12">
          <button type="button" disabled={page === 0} onClick={() => setPage(0)} aria-label="이전 안내" className="absolute -left-2 top-1/2 -translate-y-1/2 rounded-full p-2 hover:bg-sky-50 disabled:opacity-20"><ChevronLeft className="h-5 w-5" /></button>
          {page === 0 ? (
            <div className="flex min-h-48 items-center gap-2 sm:gap-4">
              <div className="min-w-0 flex-1">{example(true)}<p className="mt-3 text-center text-xs sm:text-sm">에리_기쁨.jpg</p></div>
              <ArrowRight className="h-6 w-6 shrink-0 text-sky-500" />
              <div className="min-w-0 flex-1 rounded-2xl border border-gray-200 p-3">
                <div className="mb-3 rounded-full bg-[#3679a8] py-2 text-center text-sm text-white">에리</div>
                {example(true)}<p className="mt-2 text-center text-sm text-gray-500">기쁨</p>
              </div>
            </div>
          ) : (
            <div className="grid min-h-48 grid-cols-[auto_1fr_1fr] items-center gap-3 text-center text-xs sm:text-sm">
              <span /><span className="rounded-full bg-[#3679a8] py-2 text-white">에리</span><span className="rounded-full bg-[#3679a8] py-2 text-white">배경</span>
              <span className="text-gray-500">평상시</span>{example()}{example()}
              <span className="text-gray-500">기쁨</span>{example(true)}<div className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-sky-200 text-3xl text-sky-300">+</div>
            </div>
          )}
          <button type="button" disabled={page === 1} onClick={() => setPage(1)} aria-label="다음 안내" className="absolute -right-2 top-1/2 -translate-y-1/2 rounded-full p-2 hover:bg-sky-50 disabled:opacity-20"><ChevronRight className="h-5 w-5" /></button>
        </div>
        <section aria-live="polite" className="min-h-28 text-center">
          <h3 className="text-lg font-bold">{page === 0 ? '파일 이름으로 간편하게 정리해요' : '이미지 배치표'}</h3>
          <p className="mt-3 text-sm leading-7 text-gray-500">{page === 0 ? <>에리_기쁨.jpg처럼 ‘분류_상황’ 형식으로 올리면<br />분류와 상황이 자동으로 입력돼요.</> : <>분류와 상황으로 이미지를 깔끔하게 정리해 보세요.<br />분류는 인물뿐 아니라 ‘배경’이나 ‘사물’도 가능해요.</>}</p>
        </section>
        <div className="my-6 flex justify-center gap-3">
          {[0, 1].map((index) => <button key={index} type="button" onClick={() => setPage(index)} aria-label={`${index + 1}번째 안내`} aria-current={page === index ? 'step' : undefined} className="flex h-8 w-8 items-center justify-center"><span className={`h-2.5 w-2.5 rounded-full ${page === index ? 'bg-[#3679a8]' : 'bg-gray-200'}`} /></button>)}
        </div>
        <footer className="flex gap-3">
          <button type="button" disabled={page === 0} onClick={() => setPage(0)} className="flex-1 rounded-xl bg-gray-100 py-3 font-semibold disabled:opacity-40">이전</button>
          <button type="button" onClick={() => page === 0 ? setPage(1) : onClose()} className="flex-1 rounded-xl bg-[#3679a8] py-3 font-semibold text-white hover:bg-[#28638e]">{page === 0 ? '다음' : '닫기'}</button>
        </footer>
      </div>
    </dialog>
  );
}
