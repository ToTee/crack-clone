import { generationState } from '@/lib/chat-generation';
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { chatProfile } from '@/lib/chat-profile';
import { initMemory } from '@/lib/memory';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id) as any;
  if (!session) return NextResponse.json({ error: '채팅방을 찾을 수 없습니다.' }, { status: 404 });

  const compact = new URL(req.url).searchParams.get('view') === 'chat';
  // Keep authoring prompts and embedded cover bytes off the chat read path.
  // Generation loads the full work separately on the server.
  const character = compact
    ? db.prepare(`SELECT id, name, tagline, first_message, start_settings,
        CASE WHEN avatar LIKE 'data:image/%' THEN ? ELSE avatar END AS avatar
        FROM characters WHERE id = ?`).get(`/api/characters/${encodeURIComponent(session.character_id)}/cover`, session.character_id) as any
    : db.prepare('SELECT * FROM characters WHERE id = ?').get(session.character_id) as any;
  if (!character) return NextResponse.json({ error: '작품을 찾을 수 없습니다.' }, { status: 404 });
  const messages = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC').all(id);

  let settings: any[] = [];
  try {
    const parsed = JSON.parse(character?.start_settings || '[]');
    settings = Array.isArray(parsed) ? parsed.filter((item) => item?.prologue?.trim()) : [];
  } catch {}

  const startSetting = settings[session.start_setting_index] || settings[0] || {
    name: '기본 설정',
    prologue: character?.first_message || '',
    situation: character?.tagline || '',
    playGuide: '',
    suggestedReplies: [],
  };

  const userProfile = chatProfile(session);

  return NextResponse.json({ session, character: compact ? { id: character.id, name: character.name, tagline: character.tagline, avatar: character.avatar } : character, messages, startSetting, userProfile, generation: generationState(id) }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  initMemory();
  db.transaction(() => {
    db.prepare('DELETE FROM chat_memories WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM chat_memory_jobs WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM messages WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id);
  })();
  return NextResponse.json({ success: true });
}
