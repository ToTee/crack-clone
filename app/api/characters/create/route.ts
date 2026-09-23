// app/api/characters/create/route.ts
import db from '@/lib/db';
import { validateMedia, writeMedia } from '@/lib/server-media';
import { NextResponse } from 'next/server';
import { parseEditorConfig } from '@/lib/prompt-templates';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, tagline, avatar, system_prompt, first_message, tags, start_settings } = body;
    const editorConfig = parseEditorConfig(body.editor_config);
    if (body.editor_config != null && !editorConfig) return NextResponse.json({ error: '프롬프트 설정을 확인해 주세요.' }, { status: 400 });

    if (!name || !system_prompt || !first_message) {
      return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 });
    }

    const id = 'char_' + Date.now();
    const defaultAvatar = avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=60';

    const insert = db.prepare(`
      INSERT INTO characters (id, name, tagline, avatar, system_prompt, first_message, tags, start_settings, editor_config)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    if (body.media_list !== undefined) validateMedia(body.media_list);
    db.transaction(() => {
    insert.run(
      id,
      name,
      tagline || '',
      defaultAvatar,
      system_prompt,
      first_message,
      tags || '오리지널',
      JSON.stringify(Array.isArray(start_settings) ? start_settings : []),
      editorConfig ? JSON.stringify(editorConfig) : null
    );
    if (body.media_list !== undefined) writeMedia(id, body.media_list, 0);
    })();

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
