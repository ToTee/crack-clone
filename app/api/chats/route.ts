import { initChatCallCounts } from '@/lib/chat-call-count';
import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { listThumbnail } from '@/lib/list-thumbnail';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  initChatCallCounts();
  const chats = db.prepare(`
    SELECT
      s.id,
      s.character_id,
      s.title,
      s.start_setting_index,
      s.created_at,
      s.updated_at,
      c.name AS character_name,
      c.avatar,
      c.tagline,
      COALESCE(mc.baseline + mc.calls, 0) AS chat_count,
      COALESCE(mc.baseline, 0) AS chat_count_baseline
    FROM chat_sessions s
    JOIN characters c ON c.id = s.character_id
    LEFT JOIN chat_call_counts mc ON mc.session_id = s.id
    ORDER BY s.updated_at DESC, s.created_at DESC
  `).all();

  return NextResponse.json((chats as any[]).map(chat => ({ ...chat, avatar: listThumbnail(chat.character_id,chat.avatar) })), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  try {
    const { characterId, startSettingIndex = 0, userProfile = null } = await req.json();
    const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId) as any;
    if (!character) return NextResponse.json({ error: '작품을 찾을 수 없습니다.' }, { status: 404 });

    let settings: any[] = [];
    try {
      const parsed = JSON.parse(character.start_settings || '[]');
      settings = Array.isArray(parsed) ? parsed.filter((item) => item?.prologue?.trim()) : [];
    } catch {}

    const safeIndex = Math.max(0, Math.min(Number(startSettingIndex) || 0, Math.max(0, settings.length - 1)));
    const selected = settings[safeIndex];
    const settingName = selected?.name || selected?.label || '기본 설정';
    const sessionId = `chat_${randomUUID()}`;

    const createChat = db.transaction(() => {
      db.prepare(`
        INSERT INTO chat_sessions (id, character_id, title, start_setting_index, user_profile)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        sessionId,
        characterId,
        `${character.name} · ${settingName}`,
        safeIndex,
        userProfile ? JSON.stringify(userProfile) : null
      );

      const prologue = selected?.prologue?.trim() || character.first_message?.trim();
      if (prologue) {
        db.prepare(`
          INSERT INTO messages (character_id, session_id, role, content)
          VALUES (?, ?, 'assistant', ?)
        `).run(characterId, sessionId, prologue);
      }
    });

    createChat();

    return NextResponse.json({ success: true, id: sessionId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '채팅방 생성 실패' }, { status: 500 });
  }
}
