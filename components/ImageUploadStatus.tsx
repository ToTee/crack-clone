"use client";
import { useSyncExternalStore } from 'react';
import { pendingImages, subscribeImages } from '@/lib/image-upload';
export default function ImageUploadStatus() {
  const count = useSyncExternalStore(subscribeImages,pendingImages,()=>0);
  return count ? <div role="status" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-sky-700 px-4 py-3 text-sm text-white shadow-lg">사진 {count}장 처리 중… 완료 후 저장해 주세요.</div> : null;
}
