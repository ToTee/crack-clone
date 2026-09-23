import { NextResponse } from 'next/server';
import { isAiProvider } from '@/lib/ai-config';
import { getAiSettings, getProviderKey } from '@/lib/settings';
import { discoverModels } from '@/lib/model-discovery';
import { describeAiError } from '@/lib/ai';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const body = await req.json();
    if (!isAiProvider(body.provider)) return NextResponse.json({ error: '제공업체를 선택해 주세요.' }, { status: 400, headers });
    const key = typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey.trim() : getProviderKey(getAiSettings(), body.provider);
    if (!key || key.length > 512 || /\s/.test(key)) return NextResponse.json({ error: '해당 제공업체의 API 키를 먼저 입력해 주세요.' }, { status: 400, headers });
    const models = await discoverModels(body.provider, key, AbortSignal.any([req.signal, AbortSignal.timeout(20000)]));
    return NextResponse.json({ models }, { headers });
  } catch (error) {
    const result = describeAiError(error);
    return NextResponse.json({ error: result.error }, { status: result.status, headers });
  }
}
