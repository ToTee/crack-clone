// app/api/characters/update/route.ts
import db from '@/lib/db';
import { createHash } from 'crypto';
import { validateMedia, writeMedia } from '@/lib/server-media';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { parseEditorConfig } from '@/lib/prompt-templates';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, name, tagline, avatar, system_prompt, first_message, tags, start_settings } = body;
    const editorConfig = parseEditorConfig(body.editor_config);
    if (body.editor_config != null && !editorConfig) return NextResponse.json({ error: '프롬프트 설정을 확인해 주세요.' }, { status: 400 });

    if (!id || !name) {
      return NextResponse.json({ error: 'ID와 이름은 필수입니다.' }, { status: 400 });
    }

    let savedAvatar = avatar;
    if (typeof avatar === 'string' && avatar.startsWith('/api/characters/')) {
      const current = db.prepare('SELECT avatar FROM characters WHERE id=?').get(id) as any;
      const expected = current?.avatar && `/api/characters/${encodeURIComponent(id)}/cover?v=${createHash('sha1').update(current.avatar).digest('hex').slice(0,16)}`;
      if (avatar !== expected) return NextResponse.json({error:'표지가 변경됐습니다. 수정 화면을 다시 열어 주세요.'},{status:409});
      savedAvatar = current.avatar;
    }
    const update = db.prepare(`
      UPDATE characters
      SET name = ?, tagline = ?, avatar = ?, system_prompt = ?, first_message = ?, tags = ?, start_settings = ?, editor_config = COALESCE(?, editor_config)
      WHERE id = ?
    `);

    if (body.media_list !== undefined) validateMedia(body.media_list);
    const result = db.transaction(() => {
    const result = update.run(
      name,
      tagline || '',
      savedAvatar || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
      system_prompt,
      first_message,
      tags || '오리지널',
      JSON.stringify(Array.isArray(start_settings) ? start_settings : []),
      editorConfig ? JSON.stringify(editorConfig) : null,
      id
    );
    if (result.changes && body.media_list !== undefined) writeMedia(id, body.media_list, body.media_revision);
    return result;
    })();

    if (result.changes === 0) {
      return NextResponse.json({ error: '수정할 작품을 찾지 못했습니다.' }, { status: 404 });
    }

    revalidatePath('/');
    revalidatePath(`/character/${id}`);
    revalidatePath(`/chat/${id}`);
    revalidatePath(`/edit/${id}`);

    return NextResponse.json({ success: true, changes: result.changes }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
