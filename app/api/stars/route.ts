import { NextResponse } from 'next/server';
import { depositStars, editStarDeposit, listStars, starBalance } from '@/lib/stars';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(req: Request) {
  try {
    const p = new URL(req.url).searchParams;
    if (p.get('balanceOnly') === '1') return NextResponse.json(starBalance(), { headers });
    const page = Number(p.get('page') || 0);
    const period = p.get('period') || '24h';
    if (period !== 'today' && period !== 'yesterday' && period !== '24h' && period !== '7d' && period !== 'all') return NextResponse.json({ error: '집계 기간을 확인해 주세요.' }, { status: 400, headers });
    if (!Number.isSafeInteger(page) || page < 0 || page > 100000) return NextResponse.json({ error: '페이지를 확인해 주세요.' }, { status: 400, headers });
    return NextResponse.json(listStars(p.get('type') || '전체내역', p.get('kind') || '전체', page, period), { headers });
  } catch { return NextResponse.json({ error: '별 내역을 불러오지 못했습니다.' }, { status: 500, headers }); }
}
async function mutate(req: Request, editing = false) {
  try {
    const origin = req.headers.get('origin');
    // Browser Fetch Metadata survives reverse-proxy Host/port rewriting.
    // Cross-site browser requests remain blocked even if a forwarded host matches.
    const site = req.headers.get('sec-fetch-site');
    const originUrl = origin ? new URL(origin) : null;
    const sameBrowserOrigin = site === 'same-origin';
    const hosts = [req.headers.get('host') || new URL(req.url).host,
      req.headers.get('x-forwarded-host')?.split(',')[0].trim()].filter(Boolean);
    if ((site && site !== 'same-origin' && site !== 'none') ||
        (originUrl && (!['http:', 'https:'].includes(originUrl.protocol) ||
          (!sameBrowserOrigin && !hosts.includes(originUrl.host))))) {
      return NextResponse.json({ error: '요청 출처를 확인하지 못했습니다. 사이트를 새로고침한 뒤 다시 등록해 주세요.' }, { status: 403 });
    }
  } catch { return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 403 }); }
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: '입력 내용을 확인해 주세요.' }, { status: 400 }); }
  try { if (editing) editStarDeposit(body || {}); else depositStars(body || {}); return NextResponse.json({ success: true }, { headers }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error && !('code' in error) ? error.message : '등록하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 400, headers }); }
}

export async function POST(req: Request) { return mutate(req); }
export async function PATCH(req: Request) { return mutate(req, true); }
