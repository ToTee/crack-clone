// app/api/characters/delete/route.ts
import db from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'ID가 필요합니다.' }, { status: 400 });
    }

    db.exec('CREATE TABLE IF NOT EXISTS character_media (character_id TEXT PRIMARY KEY, items TEXT NOT NULL, revision INTEGER NOT NULL)');
    db.transaction(() => {
      db.prepare('DELETE FROM character_media WHERE character_id = ?').run(id);
      db.prepare('DELETE FROM messages WHERE character_id = ?').run(id);
      db.prepare('DELETE FROM chat_sessions WHERE character_id = ?').run(id);
      db.prepare('DELETE FROM characters WHERE id = ?').run(id);
    })();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Delete Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
