import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { latestStoryChat } from '@/lib/latest-story-chat';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = { 'Cache-Control': 'no-store' };
  if (!db.prepare('SELECT id FROM characters WHERE id = ?').get(id)) {
    return NextResponse.json({ error: '작품을 찾을 수 없습니다.' }, { status: 404, headers });
  }
  return NextResponse.json({ chat: latestStoryChat(id) }, { headers });
}
