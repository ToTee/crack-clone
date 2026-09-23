'use client';
import DescriptionEditor from './DescriptionEditor';
import type { DescriptionImages } from './DescriptionContent';
import { useState } from 'react';

export type Registration = {
  descriptionImages: DescriptionImages;
  description: string; genre: string; target: string; conversation: string;
  recommendedMode: string; lengthMode: string; length: number; gptLength: number; claudeLength: number;
  hashtags: string[]; audience: string; visibility: string; commentsClosed: boolean;
};
export const defaultRegistration: Registration = {
  descriptionImages: {}, description: '', genre: '', target: '', conversation: '', recommendedMode: '스토리',
  lengthMode: 'all', length: 1, gptLength: 1, claudeLength: 1,
  hashtags: [], audience: '', visibility: 'private', commentsClosed: false,
};
export function readRegistration(value: any): Registration {
  return { ...defaultRegistration, ...(value && typeof value === 'object' ? value : {}), hashtags: Array.isArray(value?.hashtags) ? value.hashtags.filter((v: unknown) => typeof v === 'string').slice(0, 10) : [] };
}
export default function RegistrationFields({ value, onChange }: { value: Registration; onChange: (v: Registration) => void }) {
  const [tag, setTag] = useState('');
  const update = (key: keyof Registration, val: any) => onChange({ ...value, [key]: val });
  const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 focus:outline-none focus:border-sky-500';
  const select = (key: keyof Registration, label: string, options: string[]) => <label className="block space-y-2"><span className="text-sm font-semibold">{label}</span><select className={field} value={String(value[key])} onChange={e => update(key, e.target.value)}><option value="">선택해 주세요</option>{options.map(option => <option key={option}>{option}</option>)}</select></label>;
  const slider = (key: 'length' | 'gptLength' | 'claudeLength', label: string) => <label className="block rounded-xl bg-slate-50 p-4 space-y-2"><span className="text-sm">{label} · {value[key]}배</span><input aria-label={label} className="w-full accent-sky-600" type="range" min={1} max={5} step={0.5} value={value[key]} onChange={e => update(key, Number(e.target.value))} /><span className="flex justify-between text-xs text-slate-500"><span>기본</span><span>3배</span><span>5배</span></span></label>;
  const addTag = () => { const next = tag.trim().replace(/^#+/, ''); if (next && value.hashtags.length < 10 && !value.hashtags.includes(next)) update('hashtags', [...value.hashtags, next]); setTag(''); };
  return <section aria-label="등록 정보" className="space-y-7 border-t border-slate-200 pt-6">
    <DescriptionEditor text={value.description} images={value.descriptionImages || {}} onChange={(description, descriptionImages) => onChange({ ...value, description, descriptionImages })} />
    {select('genre', '장르 설정', ['로맨스', '판타지', '시뮬레이션', '현대', '일상', '학원', '무협', 'SF', '추리', '스릴러', '공포', '코미디', '기타'])}
    {select('target', '타깃 설정', ['전체', '여성향', '남성향'])}
    {select('conversation', '대화 형태 설정', ['1:1 대화', '다인 대화', '시뮬레이션'])}
    {select('recommendedMode', '권장 모드', ['스토리', '채팅'])}
    <fieldset className="space-y-3"><legend className="mb-3 text-sm font-semibold">권장 최대 답변 길이</legend><div className="grid grid-cols-2 gap-2">{[['all', '일괄 설정'], ['individual', '개별 설정']].map(([key, label]) => <label key={key} className={`rounded-xl border p-3 text-sm ${value.lengthMode === key ? 'border-sky-500 bg-sky-50' : 'border-slate-200'}`}><input type="radio" name="reply-length-mode" checked={value.lengthMode === key} onChange={() => update('lengthMode', key)} className="mr-2 accent-sky-600" />{label}</label>)}</div>{value.lengthMode === 'all' ? slider('length', '전체 모델') : <>{slider('gptLength', 'GPT')}{slider('claudeLength', 'Claude')}</>}<p className="text-xs text-slate-500">제작자의 권장값으로 저장돼요. 실제 출력 한도는 AI 환경 설정에서 정해요.</p></fieldset>
    <div className="space-y-2"><label htmlFor="story-hashtags" className="text-sm font-semibold">해시태그</label><p className="text-xs text-slate-500">단어 입력 후 Enter로 추가해 주세요. 최대 10개.</p><div className="flex gap-2"><input id="story-hashtags" className={field} value={tag} onChange={e => setTag(e.target.value)} onBlur={addTag} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!e.nativeEvent.isComposing) addTag(); } }} placeholder="단어 입력 후 Enter" /><span className="self-center whitespace-nowrap text-xs text-slate-500">{value.hashtags.length} / 10</span></div><div className="flex flex-wrap gap-2">{value.hashtags.map(t => <button type="button" key={t} aria-label={`${t} 해시태그 삭제`} onClick={() => update('hashtags', value.hashtags.filter(v => v !== t))} className="rounded-full bg-sky-50 px-3 py-1 text-sm text-sky-800">#{t} ×</button>)}</div></div>
    <fieldset className="space-y-2"><legend className="mb-3 text-sm font-semibold">이용자 층 설정</legend>{[['all', '미성년자가 대화하기에 적절해요'], ['adult', '미성년자가 대화하기에 적절하지 않아요']].map(([key, label]) => <label key={key} className="block rounded-xl bg-slate-50 p-3 text-sm"><input type="radio" name="story-audience" className="mr-2 accent-sky-600" checked={value.audience === key} onChange={() => update('audience', key)} />{label}</label>)}</fieldset>
    <fieldset className="space-y-2"><legend className="mb-3 text-sm font-semibold">공개 여부</legend>{[['public', '공개'], ['private', '비공개'], ['link', '링크 공개']].map(([key, label]) => <label key={key} className={`block rounded-xl border p-4 text-sm ${value.visibility === key ? 'border-sky-500 bg-sky-50' : 'border-slate-200'}`}><input type="radio" name="story-visibility" className="mr-2 accent-sky-600" checked={value.visibility === key} onChange={() => update('visibility', key)} />{label}</label>)}<p className="text-xs text-slate-500">분류 설정만 저장돼요. 현재 앱에는 로그인·계정별 접근 제한이 없어 비공개를 선택해도 URL 접근을 차단하지 않아요.</p></fieldset>
    <label className="flex items-center justify-between border-t border-slate-200 pt-5 text-sm">댓글 기능 닫기<input type="checkbox" role="switch" checked={value.commentsClosed} onChange={e => update('commentsClosed', e.target.checked)} className="h-5 w-5 accent-sky-600" /></label><p className="text-xs text-slate-500">현재 댓글 기능은 없으며 설정값만 저장돼요.</p>
  </section>;
}
