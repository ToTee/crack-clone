import { AI_PROVIDERS, isAiProvider, validModelId } from '@/lib/ai-config';
import { NextResponse } from 'next/server';
import { publicAiSettings, saveAiSettings, getAiSettings } from '@/lib/settings';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
const headers = { 'Cache-Control': 'no-store' };
export async function GET() {
  return NextResponse.json(publicAiSettings(), { headers });
}
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!isAiProvider(body.provider)) {
      return NextResponse.json({ error: '사용할 AI를 선택해 주세요. 화면을 새로고침한 뒤 다시 저장하세요.' }, { status: 400 });
    }
    const anthropicApiKey = typeof body.anthropicApiKey === 'string' ? body.anthropicApiKey.trim() : '';
    const openaiApiKey = typeof body.openaiApiKey === 'string' ? body.openaiApiKey.trim() : '';
    if (anthropicApiKey && !anthropicApiKey.startsWith('sk-ant-')) {
      return NextResponse.json({ error: 'Claude 칸에는 Anthropic 키(sk-ant-...)를 넣어 주세요. OpenAI 키는 GPT 칸에 넣어야 합니다.' }, { status: 400 });
    }
    if (openaiApiKey && (!openaiApiKey.startsWith('sk-') || openaiApiKey.startsWith('sk-ant-'))) {
      return NextResponse.json({ error: 'GPT 칸에는 OpenAI에서 발급한 API 키를 넣어 주세요.' }, { status: 400 });
    }
    const previous = getAiSettings();
    const geminiApiKey = typeof body.geminiApiKey === 'string' ? body.geminiApiKey.trim() : '';
    const deepseekApiKey = typeof body.deepseekApiKey === 'string' ? body.deepseekApiKey.trim() : '';
    if ([geminiApiKey, deepseekApiKey].some(key => key.length > 512 || /\s/.test(key))) return NextResponse.json({ error: 'API 키에 공백이 포함되어 있는지 확인해 주세요.' }, { status: 400 });
    const models = { ...previous.models, ...body.models };
    if (AI_PROVIDERS.some(p => !validModelId(p, models[p]))) return NextResponse.json({ error: '각 제공업체의 올바른 모델 ID를 입력해 주세요.' }, { status: 400 });
    const maxTokens = Number(body.maxTokens);
    const temperature = Number(body.temperature);
    if (!Number.isFinite(maxTokens) || !Number.isFinite(temperature)) {
      return NextResponse.json({ error: '출력량과 창의성 설정을 확인해 주세요.' }, { status: 400 });
    }
    const summaryProvider = body.summaryProvider ?? previous.summaryProvider;
    const summaryModel = body.summaryModel ?? previous.summaryModel;
    if (summaryModel !== 'same' && !AI_PROVIDERS.some(p => validModelId(p, summaryModel))) return NextResponse.json({ error: '요약 모델 ID를 확인해 주세요.' }, { status: 400 });
    if (summaryProvider !== 'same' && (!isAiProvider(summaryProvider) || (summaryModel !== 'same' && !validModelId(summaryProvider, summaryModel)))) return NextResponse.json({ error: '요약 제공업체와 모델을 확인해 주세요.' }, { status: 400 });
    if (body.recentTurns !== undefined && ![2,4,6].includes(body.recentTurns)) return NextResponse.json({ error: '최근 대화 범위를 확인해 주세요.' }, { status: 400 });
    if (body.keywordExcludeStatus !== undefined && typeof body.keywordExcludeStatus !== 'boolean') return NextResponse.json({ error: '키워드북 검색 설정을 확인해 주세요.' }, { status: 400 });
    if (body.summaryInterval !== undefined && ![5,10].includes(body.summaryInterval)) return NextResponse.json({ error: '요약 주기는 5턴 또는 10턴으로 선택해 주세요.' }, { status: 400 });
    if (body.cacheTtl !== undefined && !['5m', '1h'].includes(body.cacheTtl)) return NextResponse.json({ error: '캐시 유지 시간을 확인해 주세요.' }, { status: 400 });
    saveAiSettings({
      cacheTtl: body.cacheTtl,
      keywordExcludeStatus: body.keywordExcludeStatus, summaryInterval: body.summaryInterval, summaryModel: body.summaryModel, recentTurns: body.recentTurns,
      provider: body.provider, anthropicApiKey, openaiApiKey, geminiApiKey, deepseekApiKey, summaryProvider: body.summaryProvider, models,
      maxTokens: Math.min(20000, Math.max(500, Math.round(maxTokens))),
      temperature: Math.min(1, Math.max(0, temperature)),
    });
    return NextResponse.json({ success: true, ...publicAiSettings() }, { headers });
  } catch {
    return NextResponse.json({ error: '설정을 저장하지 못했습니다. NAS 데이터 폴더 권한과 DB 상태를 확인해 주세요.' }, { status: 500 });
  }
}
