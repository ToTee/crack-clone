import { COMPATIBLE_BASE_URLS, isTextModel, type AiProvider, type ModelOption, MODEL_OPTIONS } from '@/lib/ai-config';
// Fixed official endpoints only. Never follow redirects with a user's API key.
export async function discoverModels(provider: AiProvider, key: string, signal?: AbortSignal): Promise<ModelOption[]> {
  const results = new Map<string, ModelOption>();
  let after = '';
  for (let page = 0; page < 20; page++) {
    const url = new URL(provider === 'anthropic' ? 'https://api.anthropic.com/v1/models' : `${COMPATIBLE_BASE_URLS[provider].replace(/\/$/, '')}/models`);
    if (provider === 'anthropic') { url.searchParams.set('limit', '100'); if (after) url.searchParams.set('after_id', after); }
    else if (after) url.searchParams.set('after', after);
    const headers: Record<string, string> = provider === 'anthropic' ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' } : { Authorization: `Bearer ${key}` };
    const res = await fetch(url, { headers, redirect: 'error', cache: 'no-store', signal });
    if (!res.ok) throw Object.assign(new Error('모델 목록을 불러오지 못했습니다.'), { status: res.status });
    const body = await res.json();
    if (!Array.isArray(body.data)) throw new Error('모델 목록 형식을 확인하지 못했습니다.');
    for (const row of body.data) {
      const id = typeof row.id === 'string' ? row.id.replace(/^models\//, '') : '';
      if (isTextModel(provider, id)) results.set(id, { id, label: MODEL_OPTIONS[provider].find(m => m.id === id)?.label || id });
    }
    if (!body.has_more) return [...results.values()];
    const next = body.last_id || body.data.at(-1)?.id;
    if (typeof next !== 'string' || !next || next === after) throw new Error('모델 목록의 다음 페이지를 확인하지 못했습니다.');
    after = next;
  }
  throw new Error('모델 목록이 너무 큽니다. 직접 입력을 이용해 주세요.');
}
