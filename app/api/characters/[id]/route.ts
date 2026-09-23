// app/api/characters/[id]/route.ts
import db from '@/lib/db';
import { listThumbnail } from '@/lib/list-thumbnail';
import { createHash } from 'crypto';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as any;


  if (!character) return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  const view = new URL(req.url).searchParams.get('view');
  if (view === 'info' || view === 'edit') {
    if (character.avatar?.startsWith('data:image/')) character.avatar = view === 'info' ? listThumbnail(id, character.avatar) : `/api/characters/${encodeURIComponent(id)}/cover?v=${createHash('sha1').update(character.avatar).digest('hex').slice(0,16)}`;
    if (view === 'info') {
      character.system_prompt = '';
      try { const config = JSON.parse(character.editor_config);
        const images = config.registration?.descriptionImages;
        if (images && typeof images === 'object') for (const [key, value] of Object.entries(images)) {
          const image = value as any;
          if (image?.url?.startsWith('data:image/')) image.url = `/api/characters/${encodeURIComponent(id)}/description-image/${encodeURIComponent(key)}`;
        }
        character.editor_config = JSON.stringify({version:config.version,template:config.template,prompt:'',registration:config.registration}); } catch {}
    }
  }
  return NextResponse.json({ character }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
  });
}
