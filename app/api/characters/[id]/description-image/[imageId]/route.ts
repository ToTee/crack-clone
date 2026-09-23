import db from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, {params}: {params: Promise<{id:string; imageId:string}>}) {
  const {id,imageId} = await params;
  const row = db.prepare('SELECT editor_config FROM characters WHERE id=?').get(id) as any;
  let url: unknown;
  try { url = JSON.parse(row?.editor_config || '{}').registration?.descriptionImages?.[imageId]?.url; } catch {}
  const match = typeof url === 'string' && /^data:(image\/(?:png|jpeg|webp|gif));base64,([\s\S]+)$/.exec(url);
  if (!match) return new Response(null,{status:404});
  return new Response(new Uint8Array(Buffer.from(match[2],'base64')), {headers:{'Content-Type':match[1], 'Cache-Control':'no-store'}});
}
