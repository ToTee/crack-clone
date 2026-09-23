import db from '@/lib/db';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const key = 'chat_show_media';
export async function GET() {
  try {
    const row = db.prepare('SELECT value FROM app_settings WHERE key=?').get(key) as { value: string } | undefined;
    return Response.json({ showMedia: row?.value !== 'false' }, { headers });
  } catch { return Response.json({ error: '이미지 표시 설정을 불러오지 못했습니다.' }, { status: 500, headers }); }
}
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    if (typeof body.showMedia !== 'boolean') return Response.json({ error: '설정 값을 확인해 주세요.' }, { status: 400, headers });
    db.prepare('INSERT INTO app_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(body.showMedia));
    return Response.json({ showMedia: body.showMedia }, { headers });
  } catch { return Response.json({ error: '이미지 표시 설정을 NAS에 저장하지 못했습니다.' }, { status: 500, headers }); }
}
