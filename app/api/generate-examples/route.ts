// app/api/generate-examples/route.ts
import { generateAiText, describeAiError } from '@/lib/ai';
import { NextResponse } from 'next/server';
import { getAiSettings } from '@/lib/settings';
import { getPromptTemplate } from '@/lib/prompt-templates';

export async function POST(req: Request) {
  try {
    const { name, tagline, prompt, template } = await req.json();
    const generated = await generateAiText('당신은 웹소설 기획 AI입니다. 주어진 스토리를 바탕으로 대표 대화 예시 2개를 오직 JSON 배열로만 반환하세요. 형식: [{"user":"대사","assistant":"*행동* 대사"}]', [
        {
          role: 'user',
          content: `스토리 이름: ${name || ''}, 소개: ${tagline || ''}\n템플릿 지침: ${getPromptTemplate(template).instruction}\n제작자 프롬프트: ${typeof prompt === 'string' ? prompt : ''}`,
        },
      ], 2000, req.signal);

    const text = generated.trim();
    const startIdx = text.indexOf('[');
    const endIdx = text.lastIndexOf(']');

    if (startIdx === -1 || endIdx === -1) {
      throw new Error('JSON 배열을 찾을 수 없습니다.');
    }

    const jsonStr = text.substring(startIdx, endIdx + 1);
    const examples = JSON.parse(jsonStr);

    return NextResponse.json({ examples });
  } catch (error: unknown) {
    const result = describeAiError(error, getAiSettings().provider);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}
