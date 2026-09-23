'use client';

import { useState, useEffect } from 'react';
import GlobalPromptModal from '@/components/GlobalPromptModal';
import { X, Sliders, Check } from 'lucide-react';
import { AI_PROVIDERS, DEFAULT_MODELS, MODEL_OPTIONS, PROVIDER_NAMES, supportsTemperature, type AiProvider, type ModelOption } from '@/lib/ai-config';

interface SettingsModalProps { isOpen: boolean; onClose: () => void; }
type KeyInfo = { hasApiKey: boolean; maskedKey: string };
const emptyKeys = Object.fromEntries(AI_PROVIDERS.map(p => [p, { hasApiKey: false, maskedKey: '' }])) as Record<AiProvider, KeyInfo>;
const blankKeys = { anthropic: '', openai: '', gemini: '', deepseek: '' };

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [provider, setProvider] = useState<AiProvider>('anthropic');
  const [models, setModels] = useState({ ...DEFAULT_MODELS });
  const [keys, setKeys] = useState<Record<AiProvider, string>>(blankKeys);
  const [keyInfo, setKeyInfo] = useState<Record<AiProvider, KeyInfo>>(emptyKeys);
  const [maxTokens, setMaxTokens] = useState(3500);
  const [temperature, setTemperature] = useState(0.8);
  const [summaryModel, setSummaryModel] = useState('claude-sonnet-4-6');
  const [summaryProvider, setSummaryProvider] = useState<AiProvider | 'same'>('anthropic');
  const [catalog, setCatalog] = useState({ ...MODEL_OPTIONS });
  const [refreshing, setRefreshing] = useState<AiProvider | null>(null);
  const [modelNotice, setModelNotice] = useState('');
  const [cacheTtl, setCacheTtl] = useState<'5m' | '1h'>('1h');
  const [keywordExcludeStatus, setKeywordExcludeStatus] = useState(true);
  const [summaryInterval, setSummaryInterval] = useState(5);
  const [recentTurns, setRecentTurns] = useState(2);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [legacyKey, setLegacyKey] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);
    setError('');
    setSaved(false);
    setKeys(blankKeys);
    fetch('/api/settings', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.keys || !data.models) throw new Error('설정을 불러오지 못했습니다. 서버 업데이트 후 새로고침해 주세요.');
        if (!active) return;
        setProvider(data.provider);
        setModels({ ...DEFAULT_MODELS, ...data.models });
        setSummaryModel(data.summaryModel ?? 'claude-sonnet-4-6');
        setSummaryProvider(data.summaryProvider ?? (data.provider === 'anthropic' ? 'anthropic' : 'same'));
        setCacheTtl(data.cacheTtl === '5m' ? '5m' : '1h');
        setKeywordExcludeStatus(data.keywordExcludeStatus ?? true);
        setSummaryInterval(data.summaryInterval ?? 5);
        setRecentTurns(data.recentTurns ?? 2);
        setKeyInfo({ ...emptyKeys, ...data.keys });
        setMaxTokens(data.maxTokens);
        setTemperature(data.temperature);
        setLegacyKey(Boolean(data.legacyOpenAIKey));
        setLoading(false);
      })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaved(false);
    setError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider, models, anthropicApiKey: keys.anthropic, openaiApiKey: keys.openai, geminiApiKey: keys.gemini, deepseekApiKey: keys.deepseek, summaryProvider,
          maxTokens, temperature, summaryModel, recentTurns, summaryInterval, keywordExcludeStatus, cacheTtl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '설정 저장 실패');
      setKeyInfo({ ...emptyKeys, ...data.keys });
      setLegacyKey(Boolean(data.legacyOpenAIKey));
      setKeys(blankKeys);
      setSaved(true);
    } catch (err: any) {
      setError(err.message);
    } finally { setIsSaving(false); }
  };

  async function refreshModels(p: AiProvider) {
    setRefreshing(p); setModelNotice(''); setError('');
    try {
      const res = await fetch('/api/settings/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: p, apiKey: keys[p] }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '모델 목록 조회에 실패했습니다.');
      const known = MODEL_OPTIONS[p];
      const extra = (result.models as ModelOption[]).filter(m => !known.some(k => k.id === m.id)).sort((a,b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      setCatalog(previous => ({ ...previous, [p]: [...known, ...extra] }));
      setModelNotice(`${PROVIDER_NAMES[p]}: 계정에서 ${result.models.length}개 확인 · 기존 선택은 유지됩니다.`);
    } catch (err) { setError(err instanceof Error ? err.message : '모델 목록을 불러오지 못했습니다.'); }
    finally { setRefreshing(null); }
  }

  if (!isOpen) return null;
  const inputClass = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-sky-500';
  const canAdjust = supportsTemperature(provider, models[provider]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label="AI 모델 및 환경 설정" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 text-gray-900 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3">
          <h3 className="flex items-center gap-2 text-lg font-bold text-sky-600"><Sliders className="h-5 w-5" />AI 모델 및 환경 설정</h3>
          <button onClick={onClose} aria-label="닫기" className="rounded-lg p-1 text-gray-500"><X className="h-4 w-4" /></button>
        </div>
        <button type="button" onClick={() => setPromptOpen(true)} className="mb-4 w-full rounded-xl border border-gray-200 px-4 py-3 text-left text-sm font-semibold hover:bg-sky-50">전체 작품 공통 프롬프트 설정</button>
        <GlobalPromptModal isOpen={promptOpen} onClose={() => setPromptOpen(false)} />
        {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {loading && !error && <p className="py-6 text-center text-gray-500">NAS 설정 불러오는 중...</p>}
        <fieldset disabled={loading || isSaving} className="space-y-4 disabled:opacity-60">
          <div>
            <p className="mb-2 text-sm font-semibold">사용할 AI 선택</p>
            <div className="grid grid-cols-2 gap-2">
              {AI_PROVIDERS.map((p) => (
                <button key={p} type="button" aria-pressed={provider === p} onClick={() => { setProvider(p); setSaved(false); }}
                  className={`rounded-xl border px-3 py-3 text-sm font-semibold ${provider === p ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 bg-white text-gray-700'}`}>
                  {PROVIDER_NAMES[p]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">선택한 AI가 이후 채팅과 작품 자동 생성에 사용됩니다. 기존 대화는 유지됩니다.</p>
          </div>

          {AI_PROVIDERS.map((p) => (
            <div key={p}>
              <label htmlFor={p + '-key'} className="mb-1.5 block text-xs font-semibold">{PROVIDER_NAMES[p]} API Key</label>
              <input id={p + '-key'} type="password" autoComplete="new-password" spellCheck={false}
                value={keys[p]} onChange={(e) => { setKeys({ ...keys, [p]: e.target.value }); setSaved(false); }}
                placeholder={keyInfo[p].hasApiKey ? `저장됨 (${keyInfo[p].maskedKey}) · 변경할 때만 입력` : `${PROVIDER_NAMES[p]} API 키`}
                className={inputClass} />
              <p className="mt-1 text-xs text-gray-500">{keyInfo[p].hasApiKey ? '등록된 키 있음 · 입력칸을 비워 두면 기존 키 유지' : '등록된 키 없음 · 이 AI를 사용할 때만 필요'}</p>
            </div>
          ))}
          {legacyKey && <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-800">이전 Claude 칸에서 OpenAI 프로젝트 키를 확인했습니다. GPT를 선택하고 저장하면 해당 키를 GPT용으로 보관합니다.</p>}

          <div>
            <label htmlFor="ai-model" className="mb-1.5 block text-xs font-semibold">{PROVIDER_NAMES[provider]} 모델</label>
            <ModelPicker id="ai-model" provider={provider} value={models[provider]} options={catalog[provider]} onChange={value => { setModels({ ...models, [provider]: value }); setSaved(false); }} />
            <button type="button" disabled={!!refreshing} onClick={() => refreshModels(provider)} className="mt-2 text-xs font-semibold text-sky-700 disabled:opacity-50">{refreshing === provider ? '목록 불러오는 중…' : 'API에서 모델 목록 새로고침'}</button>
            <p className="mt-1 text-xs leading-5 text-gray-500">경량부터 상위 모델까지 텍스트 대화용 모델을 제공합니다. 계정에서 반환된 추가 모델은 목록 아래에 표시됩니다. 사용 권한·지원 종료 여부에 따라 호출 가능 여부가 달라집니다. 단가 미등록 모델의 별 사용료는 계산 대기로 표시됩니다.</p>
            {modelNotice && <p role="status" className="mt-1 text-xs text-sky-700">{modelNotice}</p>}
          </div>

          <div>
            <label htmlFor="cache-ttl" className="mb-1.5 block text-xs font-semibold">Claude 캐시 유지 시간</label>
            <select id="cache-ttl" value={cacheTtl} disabled={provider !== 'anthropic'} onChange={e => { setCacheTtl(e.target.value as '5m' | '1h'); setSaved(false); }} className={inputClass}>
              <option value="1h">1시간 · 쉬었다 이어가는 대화</option><option value="5m">5분 · 짧은 간격의 대화</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">같은 설정을 재사용하면 유지 시간이 갱신됩니다. 1시간은 최초 저장비가 더 높지만, 5분 넘게 쉬었다 이어갈 때 재저장을 줄일 수 있습니다. 다음 Claude 채팅부터 적용됩니다.</p>
          </div>
          <div>
            <label htmlFor="summary-model" className="mb-1.5 block text-xs font-semibold">대화 기억 요약 모델</label>
            <select aria-label="요약 AI 선택" value={summaryProvider} onChange={e => { const p = e.target.value as AiProvider | 'same'; setSummaryProvider(p); if (p !== 'same') setSummaryModel(DEFAULT_MODELS[p]); setSaved(false); }} className={inputClass}>
              <option value="same">본문과 같은 AI·모델</option>{AI_PROVIDERS.map(p => <option key={p} value={p}>{PROVIDER_NAMES[p]}</option>)}
            </select>
            {summaryProvider !== 'same' && <div className="mt-2"><ModelPicker id="summary-model" provider={summaryProvider} value={summaryModel === 'same' ? models[summaryProvider] : summaryModel} options={catalog[summaryProvider]} onChange={value => { setSummaryModel(value); setSaved(false); }} /><button type="button" disabled={!!refreshing} onClick={() => refreshModels(summaryProvider)} className="mt-2 text-xs text-sky-700 disabled:opacity-50">요약 모델 목록 새로고침</button></div>}
            <p className="mt-1 text-xs text-gray-500">본문과 다른 제공업체로 요약할 수 있습니다. 선택한 업체의 API 키가 필요하며 새 요약부터 적용됩니다. 기존 기억은 유지됩니다.</p>
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={keywordExcludeStatus} onChange={e => { setKeywordExcludeStatus(e.target.checked); setSaved(false); }} />키워드북 검색에서 AI 상태창 제외</label>
            <p className="mt-1 text-xs text-gray-500">상태창·INFO·STATUS로 표시된 코드블록을 검색에서 제외합니다. 사용자 입력과 이야기 본문은 검색하며, 상태창은 대화 기억에 그대로 남습니다. 상태창에만 있는 단어는 호출 조건이 되지 않습니다.</p>
          </div>
          <div>
            <label htmlFor="summary-interval" className="mb-1.5 block text-xs font-semibold">자동 요약 주기</label>
            <select id="summary-interval" value={summaryInterval} onChange={e => { setSummaryInterval(Number(e.target.value)); setSaved(false); }} className={inputClass}>
              <option value={5}>5턴 · 미요약 원문을 더 자주 정리</option><option value={10}>10턴 · 요약 호출 횟수 줄이기</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">5턴은 요약 호출이 늘어납니다. 본문과 요약 비용을 함께 비교해 주세요. 기존 기억은 유지하며, 요약이 완료되기 전에는 원문을 보존합니다.</p>
          </div>
          <div>
            <label htmlFor="recent-turns" className="mb-1.5 block text-xs font-semibold">요약된 대화 중 원문도 함께 보낼 최근 범위</label>
            <select id="recent-turns" value={recentTurns} onChange={e => { setRecentTurns(Number(e.target.value)); setSaved(false); }} className={inputClass}>
              <option value={2}>최근 2턴 · 입력 절약</option><option value={4}>최근 4턴 · 기존 범위</option><option value={6}>최근 6턴 · 세부 묘사 유지</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">1턴은 사용자 메시지와 AI 답변 한 쌍입니다. 요약되지 않은 대화는 보존합니다. 범위를 줄이면 오래된 말투·세부 묘사는 요약에 의존합니다.</p>
          </div>
          <div>
            <label htmlFor="max-tokens" className="mb-1 flex justify-between text-xs"><span>최대 출력량</span><span>{maxTokens} 토큰</span></label>
            <input id="max-tokens" type="range" min="500" max="20000" step="100" value={maxTokens}
              onChange={(e) => { setMaxTokens(Number(e.target.value)); setSaved(false); }} className="w-full accent-sky-500" />
            <p className="text-xs text-gray-500">추론 모델은 내부 추론에도 출력 한도를 사용합니다.</p>
          </div>
          <div>
            <label htmlFor="temperature" className="mb-1 flex justify-between text-xs"><span>창의성 (Temperature)</span><span>{canAdjust ? temperature : '모델 기본값'}</span></label>
            <input id="temperature" type="range" min="0" max="1" step="0.05" value={temperature} disabled={!canAdjust}
              onChange={(e) => { setTemperature(Number(e.target.value)); setSaved(false); }} className="w-full accent-blue-500 disabled:opacity-40" />
            {!canAdjust && <p className="text-xs text-gray-500">이 모델에는 창의성 값을 별도 전송하지 않습니다.</p>}
          </div>
          <p className="text-xs leading-5 text-gray-500">키는 NAS에 각각 저장됩니다. 각 제공업체의 API 사용 요금이 발생합니다. 외부 공개 사이트라면 접근 제한이 필요합니다.</p>
          <button onClick={handleSave} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 py-3 text-sm font-bold text-white">
            {saved && <Check className="h-4 w-4" />}
            {isSaving ? '저장 중...' : saved ? 'NAS에 저장 완료 · 닫고 채팅하세요' : '설정 저장하기'}
          </button>
        </fieldset>
      </div>
    </div>
  );
}

function ModelPicker({ id, provider, value, options, onChange }: { id: string; provider: AiProvider; value: string; options: ModelOption[]; onChange: (value: string) => void }) {
  const custom = !options.some(m => m.id === value);
  const cls = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900';
  return <><select id={id} value={custom ? '__custom' : value} onChange={e => onChange(e.target.value === '__custom' ? '' : e.target.value)} className={cls}>{options.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}<option value="__custom">모델 ID 직접 입력</option></select>{custom && <input aria-label={`${PROVIDER_NAMES[provider]} ${id === 'summary-model' ? '요약 ' : ''}모델 ID 직접 입력`} value={value} onChange={e => onChange(e.target.value.trim())} placeholder={`${PROVIDER_NAMES[provider]} 모델 ID`} className={cls + ' mt-2'} />}</>;
}
