// app/api/generate-profile/route.ts
import { generateAiText, describeAiError } from '@/lib/ai';
import { NextResponse } from 'next/server';
import { getAiSettings } from '@/lib/settings';

export async function POST(req: Request) {
  try {
    await req.json();
    const generated = await generateAiText(`당신은 웹소설/인터랙티브 스토리 기획 AI입니다.
참신하고 매력적인 스토리의 [이름]과 [한 줄 소개(30자 이내)], 그리고 배경에 어울리는 [Unsplash 영어 검색 키워드(예: cyberpunk, castle, forest, mystery, ocean 등 1단어)]를 생성하세요.
반드시 아래 JSON 형식으로만 답하고 다른 말은 일절 하지 마세요:
{"name": "스토리 제목", "tagline": "한 줄 소개 문구", "keyword": "영어단어"}`, [{ role: 'user', content: '무작위로 매력적인 웹소설 스토리 프로필 하나를 JSON으로 작성해줘.' }], 2000, req.signal);

    // JSON 추출 정규식 (마크다운 백틱 등 완벽 제거)
    const jsonMatch = generated.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSON 형식을 찾을 수 없습니다: ' + generated);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const cleanKeyword = (parsed.keyword || 'fantasy,mystery').replace(/[^a-zA-Z,]/g, '');
    const imageUrl = `https://images.unsplash.com/featured/?${encodeURIComponent(cleanKeyword)}`;

    return NextResponse.json({
      name: parsed.name,
      tagline: parsed.tagline,
      image: imageUrl,
    });
  } catch (error: unknown) {
    const result = describeAiError(error, getAiSettings().provider);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}
