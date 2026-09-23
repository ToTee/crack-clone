'use client';
import { useEffect, useRef, useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import StoryMarkdown from '@/components/StoryMarkdown';

const examples = [
  { title: '굵게 · 회색 글씨 · 취소선', group: '기본', source: '**굵은 글씨**\n*기울이지 않은 회색 글씨*\n***굵은 회색 글씨***\n~~취소선~~', tip: '이 앱은 *내용*을 기울임 대신 회색 글씨로 표시해요. **내용**은 굵게, ***내용***은 굵은 회색 글씨예요. _내용_도 회색으로 표시돼요.' },
  { title: '제목', group: '기본', source: '# 큰 제목\n## 중간 제목\n### 작은 제목', tip: '# 뒤에는 공백을 넣으세요. 제목 단계는 #부터 ######까지예요.' },
  { title: '줄바꿈 · 문단', group: '기본', source: '첫 번째 줄\n두 번째 줄\n\n새로운 문단', tip: '이 앱은 엔터 한 번도 줄바꿈으로 표시해요. 빈 줄을 넣으면 문단이 나뉘어요.' },
  { title: '구분선', group: '기본', source: '앞부분\n\n---\n\n뒷부분', tip: '구분선 앞뒤에 빈 줄을 두면 제목 문법과 혼동되지 않아요.' },
  { title: '목록 · 중첩 목록', group: '구조', source: '- 준비물\n  - 노트\n  - 펜\n\n1. 첫 번째 단계\n2. 두 번째 단계', tip: '하위 항목은 들여쓰기하세요. 번호 목록 안에서는 보통 공백 3칸 이상을 사용해요.' },
  { title: '체크리스트', group: '구조', source: '- [ ] 할 일\n- [x] 완료한 일', tip: '표시용 체크리스트예요. 채팅 결과에서 직접 체크하는 기능은 아니에요.' },
  { title: '인용', group: '구조', source: '> 인용문입니다.\n>\n> **강조**도 넣을 수 있어요.\n>> 중첩 인용', tip: '인용할 줄 앞에 >를 넣으세요.' },
  { title: '표', group: '구조', source: '| 이름 | 상태 |\n| :--- | ---: |\n| 에리 | 기쁨 |\n| 다인 | 평상시 |', tip: '제목 줄 바로 아래에 --- 구분 줄이 필요해요. : 위치로 정렬을 지정해요. 넓은 표는 가로로 스크롤할 수 있어요.' },
  { title: '링크', group: '기본', source: '[사이트 열기](https://example.com)\n\nhttps://example.com', tip: '대괄호에는 표시할 이름, 소괄호에는 주소를 넣으세요.' },
  { title: '인라인 코드 · 기호 그대로 쓰기', group: '기본', source: '`**이 부분은 강조되지 않아요**`\n\n\\*별표 그대로\\*', tip: '백틱 안에서는 문법을 실행하지 않아요. 기호 앞에 역슬래시를 넣어도 그대로 표시할 수 있어요.' },
  { title: '코드블록 · 상태창', group: '구조', source: '```상태창\n장소: 사장실\n시간: 오후 3시\n상태: 회의 준비\n```', tip: '백틱 3개로 시작하고 끝내세요. 첫 줄에는 상태창 이름이나 코드 언어를 적을 수 있어요. 블록 안의 마크다운과 이미지 태그는 원문으로 표시돼요.' },
  { title: '각주', group: '구조', source: '추가 설명이 있는 문장입니다.[^note]\n\n[^note]: 여기에 각주 내용을 적으세요.', tip: '본문의 식별자와 아래 설명의 식별자를 같게 쓰세요.' },
  { title: '업로드한 상황 이미지', group: '작품 전용', source: '{{사장실}}\n\n문을 열고 안으로 들어갔다.\n\n{{에리_기쁨}}', tip: '미디어에 등록한 분류 또는 분류_상황을 넣으세요. 이미지 세부 설정에서 복사한 코드도 사용할 수 있어요. 코드블록 밖에 적고, 상황 이미지 보기 옵션을 켜야 보여요.', special: '해당 작품의 사진이 이 위치에 표시돼요. 이 가이드에서는 실제 작품 사진을 불러오지 않아요.' },
  { title: '대화 프로필 이름', group: '작품 전용', source: '{user}님, 어서 오세요.', tip: '채팅에서는 선택된 대화 프로필 이름으로 바뀌어요. 이 문법은 이 앱의 전용 기능이에요.', special: '예: 대화 프로필 이름이 레나라면 → 레나님, 어서 오세요.' },
];
export default function MarkdownGuideModal({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [group, setGroup] = useState('전체');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { el?.close(); document.body.style.overflow = previous; };
  }, []);
  const visible = examples.filter(item => (group === '전체' || group === item.group) && `${item.title} ${item.tip}`.includes(query.trim()));
  return <dialog ref={dialog} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }} aria-labelledby="markdown-guide-title" className="m-auto w-[calc(100%_-_2rem)] max-w-4xl max-h-[90dvh] rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-xl backdrop:bg-black/40">
    <div className="sticky top-0 z-10 bg-white border-b border-slate-200 p-5 space-y-3">
      <div className="flex justify-between items-center gap-3"><div><h2 id="markdown-guide-title" className="font-bold text-lg">마크다운 가이드</h2><p className="text-xs text-slate-500 mt-1">작성 방법과 표시 예시를 비교하고, 필요한 문법을 복사하세요.</p></div><button autoFocus type="button" onClick={onClose} aria-label="가이드 닫기" className="p-2 rounded-lg hover:bg-slate-100"><X size={20} /></button></div>
      <input aria-label="마크다운 문법 검색" value={query} onChange={e => setQuery(e.target.value)} placeholder="표, 강조, 이미지 등 검색" className="w-full border border-slate-200 rounded-xl p-2.5 text-sm" />
      <div className="flex flex-wrap gap-2">{['전체', '기본', '구조', '작품 전용'].map(value => <button type="button" key={value} onClick={() => setGroup(value)} aria-pressed={group === value} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${group === value ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{value}</button>)}</div>
      <p role="status" className="text-xs text-sky-700">{error || (copied ? `${copied} 예시를 복사했어요.` : '표준 마크다운과 GFM 지원 · HTML 실행, 수식, Mermaid 렌더링은 미지원')}</p>
    </div>
    <div className="p-5 space-y-5">{visible.map(item => <section key={item.title} className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex justify-between items-center gap-3 px-4 py-3 bg-slate-50"><h3 className="text-sm font-bold">{item.title}</h3><button type="button" className="flex items-center gap-1 text-xs text-sky-700 shrink-0" onClick={async () => { try { await navigator.clipboard.writeText(item.source); setCopied(item.title); setError(''); } catch { setError('복사하지 못했어요. 아래 작성 예시를 직접 선택해서 복사해 주세요.'); } }}>{copied === item.title ? <Check size={14} /> : <Copy size={14} />}예시 복사</button></div>
      <div className="grid md:grid-cols-2"><div className="min-w-0 p-4 bg-slate-50/50"><p className="text-xs font-semibold text-slate-500 mb-2">이렇게 작성</p><pre className="text-sm whitespace-pre-wrap break-words select-text font-mono">{item.source}</pre></div><div className="min-w-0 p-4 border-t md:border-t-0 md:border-l border-slate-200"><p className="text-xs font-semibold text-slate-500 mb-2">이렇게 표시</p>{item.special ? <p className="text-sm text-slate-600 leading-relaxed">{item.special}</p> : <div className="text-sm"><StoryMarkdown content={item.source} /></div>}</div></div>
      <p className="px-4 py-3 text-xs text-slate-500 border-t border-slate-100 leading-relaxed">{item.tip}</p>
    </section>)}{!visible.length && <p className="text-center py-8 text-sm text-slate-500">일치하는 문법이 없어요.</p>}</div>
  </dialog>;
}
