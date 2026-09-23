import db from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}) {
  const {id} = await params;
  const row = db.prepare('SELECT avatar FROM characters WHERE id=?').get(id) as any;
  const match = /^data:(image\/[^;,]+);base64,([\s\S]+)$/.exec(row?.avatar || '');
  if (!match) return new Response(null,{status:404});
  return new Response(new Uint8Array(Buffer.from(match[2],'base64')),{headers:{'Content-Type':match[1],'Cache-Control':'no-store'}});
}
