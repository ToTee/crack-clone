import db from '@/lib/db';
import { readMedia } from '@/lib/server-media';
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, {params}: {params:Promise<{id:string;itemId:string}>}) {
  const {id,itemId} = await params;
  if (!db.prepare('SELECT id FROM characters WHERE id=?').get(id)) return new Response(null,{status:404});
  const item = readMedia(id).items.find((item:any)=>item.id===itemId);
  const match = /^data:(image\/[^;,]+);base64,([\s\S]+)$/.exec(item?.url || '');
  if (!match) return new Response(null,{status:404});
  return new Response(new Uint8Array(Buffer.from(match[2],'base64')),{headers:{'Content-Type':match[1],'Cache-Control':'no-store'}});
}
