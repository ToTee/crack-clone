import db from '@/lib/db';
import { after } from 'next/server';
import { AiError, describeAiError } from '@/lib/ai';
import { MEMORY_KINDS, memorySnapshot, updateMemory, drainMemory } from '@/lib/memory';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
async function handle(req: Request, ctx: Context) {
  try {
    const { id } = await ctx.params;
    const snapshot = memorySnapshot(id);
    if (req.method === 'GET') return Response.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
    const body = await req.json();
    if (req.method === 'POST' && body.action === 'refresh') {
      const result = await updateMemory(id, req.signal);
      after(() => drainMemory(id));
      return Response.json(result);
    }
    if (req.method !== 'DELETE' && (!MEMORY_KINDS.includes(body.kind) || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 120 || typeof body.content !== 'string' || !body.content.trim() || body.content.length > 6000)) {
      throw new AiError('제목(120자 이내), 내용(6000자 이내), 기억 종류를 확인해 주세요.');
    }
    if (req.method !== 'POST' && (!Number.isSafeInteger(body.id) || body.id <= 0)) throw new AiError('기억 ID를 확인해 주세요.');
    db.transaction(() => {
      if (req.method === 'POST') {
        db.prepare('INSERT INTO chat_memories(session_id,kind,title,content,manual) VALUES (?,?,?,?,1)').run(id, body.kind, body.title.trim(), body.content.trim());
      } else {
        const row = db.prepare('SELECT * FROM chat_memories WHERE id=? AND session_id=? AND hidden=0').get(body.id, id) as any;
        if (!row) throw new AiError('기억을 찾을 수 없습니다.', 404);
        if (req.method === 'DELETE') {
          // Keep automatic coverage marker so a deleted memory is not regenerated immediately.
          db.prepare('UPDATE chat_memories SET hidden=1, updated_at=CURRENT_TIMESTAMP WHERE id=? AND session_id=?').run(body.id, id);
        } else {
          if (!row.manual && row.kind !== body.kind) throw new AiError('자동 요약의 종류는 바꿀 수 없습니다.');
          db.prepare('UPDATE chat_memories SET kind=?,title=?,content=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND session_id=?').run(body.kind, body.title.trim(), body.content.trim(), body.id, id);
        }
        if (!row.manual && row.kind === 'long') {
          // Later cumulative snapshots depend on this edited/deleted memory.
          db.prepare("DELETE FROM chat_memories WHERE session_id=? AND manual=0 AND kind='long' AND start_turn<=? AND end_turn>?").run(id, row.start_turn, row.end_turn);
        }
        if (!row.manual && row.kind === 'short') {
          db.prepare("UPDATE chat_memories SET hidden=1 WHERE session_id=? AND manual=0 AND kind IN ('relations','goals','facts','scene') AND start_turn=? AND end_turn=?").run(id, row.start_turn, row.end_turn);
          if (req.method !== 'DELETE') db.prepare('UPDATE chat_memories SET format_version=1 WHERE id=?').run(row.id);
        }
        if (!row.manual && row.format_version < 2 && ['relations', 'goals'].includes(row.kind)) {
          const short = db.prepare("SELECT * FROM chat_memories WHERE session_id=? AND manual=0 AND kind='short' AND start_turn=? AND end_turn=?").get(id, row.start_turn, row.end_turn) as any;
          if (short) {
            const label = row.kind === 'relations' ? '관계: ' : '목표: ';
            const replacement = req.method === 'DELETE' ? '사용자가 해당 요약 항목을 삭제함' : body.content.trim();
            db.prepare('UPDATE chat_memories SET content=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(short.content.replace(label + row.content, label + replacement), short.id);
          }
        }
        if (!row.manual && ['short', 'relations', 'goals'].includes(row.kind)) db.prepare("DELETE FROM chat_memories WHERE session_id=? AND manual=0 AND kind='long' AND start_turn<=? AND end_turn>=?").run(id, row.end_turn, row.start_turn);
      }
      db.prepare("INSERT INTO chat_memory_jobs(session_id,revision) VALUES (?,1) ON CONFLICT(session_id) DO UPDATE SET revision=revision+1,error=''").run(id);
    })();
    return Response.json(memorySnapshot(id));
  } catch (error) {
    const result = describeAiError(error);
    return Response.json(result, { status: result.status });
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
