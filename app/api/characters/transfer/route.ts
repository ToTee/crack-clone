import { exportWork, importWork } from '@/lib/work-transfer';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BYTES = 250 * 1024 * 1024;
export async function GET(req: Request) {
  const file = exportWork(new URL(req.url).searchParams.get('id') || '');
  if (!file) return Response.json({ error: '작품을 찾을 수 없습니다.' }, { status: 404 });
  const filename = `${String(file.work.name).replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 80)}.work.json`;
  return new Response(JSON.stringify(file), { headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="work.json"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  } });
}
export async function POST(req: Request) {
  if (['cross-site', 'same-site'].includes(req.headers.get('sec-fetch-site') || '')) return Response.json({ error: '사이트 안에서 가져오기를 실행해 주세요.' }, { status: 403 });
  try {
    if (Number(req.headers.get('content-length')) > MAX_BYTES) return Response.json({ error: '250MB 이하의 작품 파일을 선택해 주세요.' }, { status: 413 });
    const reader = req.body?.getReader();
    if (!reader) return Response.json({ error: '파일 내용이 없습니다.' }, { status: 400 });
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); return Response.json({ error: '250MB 이하의 작품 파일을 선택해 주세요.' }, { status: 413 }); }
      chunks.push(value);
    }
    let file: unknown;
    try { file = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return Response.json({ error: '올바른 JSON 작품 파일이 아닙니다.' }, { status: 400 }); }
    return Response.json({ success: true, ...importWork(file) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '작품을 가져오지 못했습니다.' }, { status: 400 });
  }
}
