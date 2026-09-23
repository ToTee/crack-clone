// components/UserNoteModal.tsx
'use client';

import { useState, useEffect } from 'react';
import { loadUserNote } from '@/lib/user-note-client';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  characterId: string;
  onSaveNote: (note: string) => void;
}

const MAX_NOTE_LENGTH = 10000;

export default function UserNoteModal({
  isOpen,
  onClose,
  characterId,
  onSaveNote,
}: Props) {
  const [noteText, setNoteText] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setReady(false); setError(''); setIsSaved(false);
    loadUserNote(characterId).then(data => {
      if (active) { setNoteText(data.note || ''); setRevision(data.revision); setReady(true); }
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [isOpen, characterId]);

  const handleSave = async () => {
    if (busy || !ready) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/chats/${encodeURIComponent(characterId)}/note`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteText, revision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'NAS 저장에 실패했습니다.');
      setRevision(data.revision); setNoteText(data.note); onSaveNote(data.note); setIsSaved(true);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white text-gray-900 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-fadeIn relative">
        
        {/* 상단 헤더 */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 tracking-tight">유저노트</h3>
          <button 
            onClick={onClose} 
            className="p-1 text-gray-500 hover:text-gray-900 rounded-full hover:bg-gray-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 상단 안내 문구 */}
        <p className="text-xs text-gray-600 leading-relaxed">
          이 채팅방의 개인 프롬프트입니다. NAS에 저장되어 다른 기기에서도 불러오고, 매번 AI에게 전달됩니다.
        </p>

        {/* 👇 사진 속 입력 텍스트에어리어 */}
        <div className="border border-gray-200 rounded-2xl p-3.5 focus-within:border-black transition">
          <textarea
            disabled={!ready || busy}
            rows={8}
            maxLength={MAX_NOTE_LENGTH}
            placeholder="잊으면 안되는 중요한 내용, 추가하고 싶은 설정 등"
            value={noteText}
            onChange={(e) => { setNoteText(e.target.value); setIsSaved(false); }}
            className="w-full bg-transparent text-xs text-gray-800 placeholder-gray-400 focus:outline-none resize-none leading-relaxed"
          />
        </div>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {/* 하단 글자수 카운터 및 등록 버튼 */}
        <div className="flex items-center justify-between pt-1">
          <div className="space-y-0.5">
            <span className="text-[11px] font-mono text-gray-500 block">
              {noteText.length}/{MAX_NOTE_LENGTH}자
            </span>
            <span className="text-[10px] text-sky-600 font-semibold block">
              ● 채팅방별 NAS 저장
            </span>
          </div>

          <button
            type="button"
            disabled={!ready || busy}
            onClick={handleSave}
            className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow active:scale-95"
          >
            {busy ? '저장 중…' : !ready ? '불러오는 중…' : isSaved ? 'NAS 저장 완료' : '저장'}
          </button>
        </div>

      </div>
    </div>
  );
}
