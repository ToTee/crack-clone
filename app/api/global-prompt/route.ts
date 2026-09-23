import { NextResponse } from 'next/server';
import { getGlobalPromptState, saveGlobalPrompt, saveGlobalPromptSections } from '@/lib/global-prompt';
import { isGlobalPromptSections } from '@/lib/global-prompt-sections';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
export async function GET() {
  try { return NextResponse.json(getGlobalPromptState(), { headers }); }
  catch { return NextResponse.json({ error: '공용 프롬프트를 불러오지 못했습니다.' }, { status: 500, headers }); }
}
export async function PUT(req: Request) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: '프롬프트 내용을 확인해 주세요.' }, { status: 400, headers }); }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return NextResponse.json({ error: '프롬프트 내용을 확인해 주세요.' }, { status: 400, headers });
  try {
    if ('sections' in body) {
      if (!isGlobalPromptSections(body.sections) || typeof body.revision !== 'string' || !/^[a-f0-9]{64}$/.test(body.revision))
        return NextResponse.json({ error: '네 칸의 프롬프트 내용을 확인해 주세요.' }, { status: 400, headers });
      const result = saveGlobalPromptSections(body.sections, body.revision);
      if (!result)
        return NextResponse.json({ error: '다른 창에서 변경됐습니다. 작성 내용을 복사한 뒤 창을 다시 열어 주세요.' }, { status: 409, headers });
      return NextResponse.json(result, { headers });
    }
    if (typeof body.prompt !== 'string' || typeof body.previous !== 'string')
      return NextResponse.json({ error: '프롬프트 내용을 확인해 주세요.' }, { status: 400, headers });
    if (!saveGlobalPrompt(body.prompt, body.previous))
      return NextResponse.json({ error: '다른 창에서 변경됐습니다. 작성 내용을 복사한 뒤 창을 다시 열어 주세요.' }, { status: 409, headers });
    return NextResponse.json(getGlobalPromptState(), { headers });
  } catch {
    return NextResponse.json({ error: '저장하지 못했습니다. 다시 시도해 주세요.' }, { status: 500, headers });
  }
}
