import { initChatCallCounts } from '@/lib/chat-call-count';
import { randomUUID } from 'crypto';
import db from '@/lib/db';
import { invalidateMemory } from '@/lib/memory';

type Context = { params: Promise<{ id: string; messageId: string }> };

async function act(req: Request, ctx: Context, action: 'edit' | 'delete' | 'branch') {
  const { id, messageId } = await ctx.params;
  if (!/^\d+$/.test(messageId) || !Number.isSafeInteger(Number(messageId))) {
    return Response.json({ error: '저장된 메시지를 선택해 주세요.' }, { status: 400 });
  }
  let content: unknown;
  if (action === 'edit') {
    try { content = (await req.json()).content; } catch {
      return Response.json({ error: '수정 내용을 확인해 주세요.' }, { status: 400 });
    }
    if (typeof content !== 'string' || !content.trim()) {
      return Response.json({ error: '내용을 비워 둘 수 없습니다.' }, { status: 400 });
    }
  }
  try {
    const result = db.transaction(() => {
      const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id) as any;
      const message = db.prepare('SELECT * FROM messages WHERE session_id = ? AND id = ?').get(id, Number(messageId));
      if (!session || !message) return null;
      initChatCallCounts();
      if (action === 'branch') {
        const newId = `chat_${randomUUID()}`;
        db.prepare('INSERT INTO chat_sessions (id, character_id, title, start_setting_index, user_profile, user_note) VALUES (?, ?, ?, ?, ?, ?)')
          .run(newId, session.character_id, `${session.title} · 분기`, session.start_setting_index, session.user_profile, session.user_note ?? null);
        db.prepare(`INSERT INTO messages (character_id, session_id, role, content, created_at)
          SELECT character_id, ?, role, content, created_at FROM messages
          WHERE session_id = ? AND id <= ? ORDER BY id ASC`).run(newId, id, Number(messageId));
        db.prepare('INSERT INTO chat_call_counts(session_id) VALUES (?)').run(newId);
        return { success: true, id: newId };
      }
      if (action === 'edit') {
        db.prepare('UPDATE messages SET content = ? WHERE session_id = ? AND id = ?').run(content, id, Number(messageId));
      } else {
        db.prepare('DELETE FROM messages WHERE session_id = ? AND id = ?').run(id, Number(messageId));
      }
      invalidateMemory(id);
      db.prepare('UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
      const messages = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC').all(id);
      return { success: true, messages };
    })();
    return result ? Response.json(result) : Response.json({ error: '메시지를 찾을 수 없습니다. 새로고침해 주세요.' }, { status: 404 });
  } catch {
    return Response.json({ error: '변경을 저장하지 못했습니다. 다시 시도해 주세요.' }, { status: 500 });
  }
}

export const PATCH = (req: Request, ctx: Context) => act(req, ctx, 'edit');
export const DELETE = (req: Request, ctx: Context) => act(req, ctx, 'delete');
export const POST = (req: Request, ctx: Context) => act(req, ctx, 'branch');
