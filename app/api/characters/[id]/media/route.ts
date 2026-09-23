import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { readMedia, writeMedia, validateMedia, compactMedia } from '@/lib/server-media';
function exists(id: string) { return db.prepare('SELECT id FROM characters WHERE id = ?').get(id); }
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!exists(id)) return NextResponse.json({ error: '작품을 찾을 수 없습니다.' }, { status: 404 });
  return NextResponse.json(new URL(req.url).searchParams.get('compact') === '1' ? compactMedia(id,readMedia(id)) : readMedia(id), { headers: { 'Cache-Control': 'no-store' } });
}
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: '사진 데이터를 읽지 못했습니다.' }, { status: 400 }); }
  try { validateMedia(body.items); } catch { return NextResponse.json({ error: '미디어 목록을 확인해 주세요.' }, { status: 400 }); }
  return db.transaction(() => {
    if (!exists(id)) return NextResponse.json({ error: '작품을 찾을 수 없습니다.' }, { status: 404 });
    const current = readMedia(id);
    // First migration wins. Never resurrect saved/cleared media from a browser.
    if (body.mode === 'migrate' && current.initialized) return NextResponse.json(new URL(req.url).searchParams.get('compact') === '1' ? compactMedia(id,current) : current);
    if (body.mode !== 'migrate' && body.revision !== current.revision) return NextResponse.json({ error: '다른 기기에서 미디어가 변경됐습니다. 수정 화면을 다시 열어 주세요.' }, { status: 409 });
    const items = body.mode === 'migrate' ? body.items.map((item: any) => ({ ...item, targetScope: 'all' })) : body.items;
    writeMedia(id, items, current.revision);
    return NextResponse.json(new URL(req.url).searchParams.get('compact') === '1' ? compactMedia(id,readMedia(id)) : readMedia(id));
  })();
}
