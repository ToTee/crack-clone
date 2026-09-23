import db from '@/lib/db';
type Context = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, ctx: Context) {
  const { id } = await ctx.params;
  const row = db.prepare('SELECT user_note AS note, note_revision AS revision FROM chat_sessions WHERE id=?').get(id);
  return row ? Response.json(row, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ error: '채팅방을 찾을 수 없습니다.' }, { status: 404 });
}
export async function PATCH(req: Request, ctx: Context) {
  const { id } = await ctx.params;
  let body: any;
  try { body = await req.json(); } catch { return Response.json({ error: '노트 내용을 확인해 주세요.' }, { status: 400 }); }
  if (typeof body.note !== 'string' || body.note.length > 10000 || (body.mode !== 'migrate' && !Number.isSafeInteger(body.revision))) return Response.json({ error: '노트는 10,000자 이내로 입력해 주세요.' }, { status: 400 });
  try {
    return db.transaction(() => {
      const row = db.prepare('SELECT user_note AS note, note_revision AS revision FROM chat_sessions WHERE id=?').get(id) as any;
      if (!row) return Response.json({ error: '채팅방을 찾을 수 없습니다.' }, { status: 404 });
      // NULL is never saved; empty string is an intentional cleared note.
      if (body.mode === 'migrate' && row.note !== null) return Response.json(row);
      if (body.mode !== 'migrate' && row.revision !== body.revision) return Response.json({ error: '다른 기기에서 노트가 변경됐습니다. 작성 내용을 복사하고 다시 열어 최신 내용을 확인해 주세요.' }, { status: 409 });
      const note = body.note.trim();
      db.prepare('UPDATE chat_sessions SET user_note=?,note_revision=note_revision+1 WHERE id=?').run(note, id);
      return Response.json({ note, revision: row.revision + 1 });
    })();
  } catch { return Response.json({ error: 'NAS에 노트를 저장하지 못했습니다. 다시 시도해 주세요.' }, { status: 500 }); }
}
