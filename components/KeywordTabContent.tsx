// components/KeywordTabContent.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { HelpCircle, Plus, GripVertical } from 'lucide-react';
import StartSettingPreview from '@/components/StartSettingPreview';
import { StartSettingItem } from '@/components/StartSettingTab';
import { reorderKeywordNotes } from '@/lib/keyword-order';
import KeywordNoteCard from '@/components/KeywordNoteCard';

export interface KeywordNoteItem {
  id: string;
  title: string;
  info: string;
  keywords: string[];
  appliedTargets: string[];
  triggerMode?: 'general' | 'direct';
}

interface Props {
  keywords: KeywordNoteItem[];
  setKeywords: React.Dispatch<React.SetStateAction<KeywordNoteItem[]>>;
  startSettings: StartSettingItem[];
  name?: string;
  image?: string;
}

export default function KeywordTabContent({
  keywords = [],
  setKeywords,
  startSettings = [],
  name = '',
  image = '',
}: Props) {
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const handleAddNote = () => {
    const nextNum = keywords.length + 1;
    const newId = Date.now().toString();
    const newNote: KeywordNoteItem = {
      id: newId,
      title: `키워드 노트 ${nextNum}`,
      info: '',
      keywords: [],
      appliedTargets: activeFilter === 'all' ? ['default', 'extra1', 'extra2'] : [activeFilter],
    };
    setKeywords((prev) => [...prev, newNote]);
    setExpandedIds((prev) => ({ ...prev, [newId]: true }));
  };

  const handleDeleteNote = (id: string) => {
    setKeywords((prev) => prev.filter((k) => k.id !== id));
  };

  const handleUpdateNote = (id: string, field: keyof KeywordNoteItem, val: any) => {
    setKeywords((prev) =>
      prev.map((k) => (k.id === id ? { ...k, [field]: val } : k))
    );
  };

  const isCommon = (k: KeywordNoteItem) => k.appliedTargets.includes('all') || ['default', 'extra1', 'extra2'].every(target => k.appliedTargets.includes(target));
  const countAll = keywords.filter(isCommon).length;
  const countDefault = keywords.filter((k) => !isCommon(k) && k.appliedTargets.includes('default')).length;
  const countExtra1 = keywords.filter((k) => !isCommon(k) && k.appliedTargets.includes('extra1')).length;
  const countExtra2 = keywords.filter((k) => !isCommon(k) && k.appliedTargets.includes('extra2')).length;

  const filteredNotes = keywords.filter((k) => {
    if (activeFilter === 'all') return isCommon(k);
    return !isCommon(k) && k.appliedTargets.includes(activeFilter);
  });

  const listRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{id:string;x:number;y:number;startY:number;moved:boolean;before:string|null;inside:boolean} | null>(null);
  const frame = useRef<number | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropBefore, setDropBefore] = useState<string | null>(null);
  const stopDrag = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null; drag.current = null; setDragId(null); setDropBefore(null);
  };
  useEffect(() => { stopDrag(); }, [activeFilter]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  const trackDrag = () => {
    const active = drag.current, list = listRef.current;
    if (!active || !list) return;
    const bounds = list.getBoundingClientRect();
    active.inside = active.x >= bounds.left && active.x <= bounds.right;
    if (active.moved && active.inside) {
      let parent = list.parentElement;
      while (parent && !(parent.scrollHeight > parent.clientHeight && /auto|scroll/.test(getComputedStyle(parent).overflowY))) parent = parent.parentElement;
      const top = parent ? parent.getBoundingClientRect().top : 0;
      const bottom = parent ? parent.getBoundingClientRect().bottom : window.innerHeight;
      const delta = active.y < top + 70 ? -Math.min(18,(top+70-active.y)/3) : active.y > bottom-70 ? Math.min(18,(active.y-bottom+70)/3) : 0;
      if (parent) parent.scrollTop += delta; else window.scrollBy(0,delta);
      const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-keyword-id]'));
      const next = rows.find(row => row.dataset.keywordId !== active.id && active.y < row.getBoundingClientRect().top + row.getBoundingClientRect().height/2);
      active.before = next?.dataset.keywordId || null; setDropBefore(active.before);
    }
    frame.current = requestAnimationFrame(trackDrag);
  };
  const startDrag = (event: React.PointerEvent<HTMLButtonElement>, id:string) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {id,x:event.clientX,y:event.clientY,startY:event.clientY,moved:false,before:null,inside:true};
    setDragId(id); trackDrag();
  };
  const finishDrag = () => {
    const active = drag.current;
    if (active?.moved && active.inside) setKeywords(prev => reorderKeywordNotes(prev,filteredNotes.map(note=>note.id),active.id,active.before));
    stopDrag();
  };
  const moveByKey = (id:string, direction:number) => {
    const ids = filteredNotes.map(note=>note.id), index = ids.indexOf(id), next = index+direction;
    if (next < 0 || next >= ids.length) return;
    const before = direction < 0 ? ids[next] : ids[next+1] || null;
    setKeywords(prev=>reorderKeywordNotes(prev,ids,id,before));
  };

  const defaultSetting = startSettings[0] || {
    id: 0,
    label: '기본 설정',
    name: '기본 설정',
    prologue: '',
    situation: '',
    playGuide: '',
    suggestedReplies: [],
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-7 space-y-5">
        
        {/* 상단 안내 */}
        <div className="space-y-1.5">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
            키워드북
            <HelpCircle className="w-4 h-4 text-gray-500" />
          </h3>
          <div className="text-xs text-gray-500 leading-relaxed space-y-0.5">
            <p>전체 탭은 모든 시작설정의 공통 항목이고, 개별 탭은 해당 시작설정 전용 항목이에요.</p>
            <p>이번 입력과 최근 대화 메시지 4개에서 키워드를 찾아, 현재 시작설정에 적용되는 항목만 AI에 전달해요.</p>
          </div>
        </div>

        {/* 4개 알약 필터 탭 */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition flex items-center gap-1.5 shrink-0 ${
              activeFilter === 'all'
                ? 'bg-sky-500 text-white border border-gray-300 shadow-md ring-1 ring-gray-200'
                : 'bg-gray-50 text-gray-500 hover:text-gray-700 border border-transparent'
            }`}
          >
            <span>전체</span>
            <span className="text-[11px] font-mono">{countAll}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('default')}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition flex items-center gap-1.5 shrink-0 ${
              activeFilter === 'default'
                ? 'bg-sky-500 text-white border border-gray-300 shadow-md ring-1 ring-gray-200'
                : 'bg-gray-50 text-gray-500 hover:text-gray-700 border border-transparent'
            }`}
          >
            <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded-md">기본</span>
            <span>{startSettings.find(s => s.id === 0)?.name || '기본 설정'}</span>
            <span className="text-[11px] font-mono">{countDefault}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('extra1')}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition flex items-center gap-1.5 shrink-0 ${
              activeFilter === 'extra1'
                ? 'bg-sky-500 text-white border border-gray-300 shadow-md ring-1 ring-gray-200'
                : 'bg-gray-50 text-gray-500 hover:text-gray-700 border border-transparent'
            }`}
          >
            <span>{startSettings.find(s => s.id === 1)?.name || '추가 설정 1'}</span>
            <span className="text-[11px] font-mono">{countExtra1}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('extra2')}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition flex items-center gap-1.5 shrink-0 ${
              activeFilter === 'extra2'
                ? 'bg-sky-500 text-white border border-gray-300 shadow-md ring-1 ring-gray-200'
                : 'bg-gray-50 text-gray-500 hover:text-gray-700 border border-transparent'
            }`}
          >
            <span>{startSettings.find(s => s.id === 2)?.name || '추가 설정 2'}</span>
            <span className="text-[11px] font-mono">{countExtra2}</span>
          </button>
        </div>

        {/* 키워드 노트 카드 리스트 */}
        <div ref={listRef} className="space-y-3 pt-1">
          {filteredNotes.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-8 text-center text-xs text-gray-500">
              등록된 키워드 노트가 없습니다. 아래 버튼을 눌러 추가하세요.
            </div>
          ) : (
            filteredNotes.map((note) => (
              <div key={note.id} data-keyword-id={note.id} className={`${dragId === note.id ? 'opacity-40' : ''} ${dragId && dropBefore === note.id ? 'border-t-2 border-sky-500' : ''}`}>
              <KeywordNoteCard
                dragHandle={<button type="button" aria-label={`${note.title} 순서 이동`} title="드래그하여 이동 · 키보드 ↑↓ 이동"
                  onPointerDown={event=>startDrag(event,note.id)}
                  onPointerMove={event=>{const active=drag.current;if(active){active.x=event.clientX;active.y=event.clientY;active.moved ||= Math.abs(active.y-active.startY)>5;}}}
                  onPointerUp={finishDrag} onPointerCancel={stopDrag} onLostPointerCapture={()=>{if(drag.current)stopDrag();}}
                  onKeyDown={event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();moveByKey(note.id,event.key==='ArrowUp'?-1:1);}else if(event.key==='Escape')stopDrag();}}
                  style={{touchAction:'none'}} className="p-1.5 shrink-0 text-gray-500 cursor-grab active:cursor-grabbing"><GripVertical className="w-4 h-4" /></button>}
                note={note}
                startSettings={startSettings}
                isExpanded={expandedIds[note.id] ?? false}
                onToggleExpand={() => setExpandedIds((p) => ({ ...p, [note.id]: !p[note.id] }))}
                onDelete={() => handleDeleteNote(note.id)}
                onUpdate={(field, val) => handleUpdateNote(note.id, field, val)}
              />
              </div>
            ))
          )}

          {dragId && !dropBefore && <div className="h-0.5 bg-sky-500" />}
          <p className="text-xs text-gray-500">왼쪽 손잡이를 드래그해 순서를 바꿀 수 있어요. 작품 저장 시 반영됩니다.</p>
          {/* + 키워드 노트 추가 버튼 */}
          <button
            type="button"
            onClick={handleAddNote}
            className="w-full py-3.5 bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-300 rounded-2xl text-xs font-bold text-gray-700 flex items-center justify-center gap-1.5 transition active:scale-[0.99] shadow-sm"
          >
            <Plus className="w-4 h-4 text-sky-600" /> 키워드 노트 추가
          </button>
        </div>

      </div>

      {/* 우측 실시간 채팅/스토리 미리보기 */}
      <StartSettingPreview
        currentSetting={defaultSetting}
        image={image}
        name={name}
      />

    </div>
  );
}
