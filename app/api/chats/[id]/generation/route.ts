import db from '@/lib/db';
import { generationState, requestGenerationStop } from '@/lib/chat-generation';
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return Response.json({ generation: generationState(id) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    if (typeof body.token !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(body.token)) return Response.json({ error: '생성 정보를 다시 불러와 주세요.' }, { status: 400 });
    if (!db.prepare('SELECT id FROM chat_sessions WHERE id=?').get(id)) return Response.json({ error: '채팅방이 없습니다.' }, { status: 404 });
    requestGenerationStop(id,body.token);
    return Response.json({ success: true });
  } catch { return Response.json({ error: '중단 요청을 저장하지 못했습니다.' }, { status: 500 }); }
}
