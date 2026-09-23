import db from '@/lib/db';
import sharp from 'sharp';
import { createHash } from 'crypto';
export const dynamic = 'force-dynamic';
const cache = new Map<string, Buffer>();
const pending = new Map<string, Promise<Buffer>>();
export async function GET(_req: Request, { params }: { params: Promise<{id:string}> }) {
  const { id } = await params;
  const row = db.prepare('SELECT avatar FROM characters WHERE id=?').get(id) as {avatar:string}|undefined;
  if (!row) return new Response(null,{status:404});
  const match = /^data:(image\/[^;,]+);base64,([\s\S]+)$/.exec(row.avatar);
  if (!match) return new Response(null,{status:404});
  const key = createHash('sha1').update(row.avatar).digest('hex');
  try {
    const original = Buffer.from(match[2],'base64');
    const metadata = await sharp(original).metadata();
    let animatedPng = false;
    if (metadata.format === 'png') {
      for (let offset = 8; offset + 12 <= original.length;) {
        const length = original.readUInt32BE(offset);
        if (offset + 12 + length > original.length) break;
        if (original.toString('ascii',offset + 4,offset + 8) === 'acTL') { animatedPng = true; break; }
        offset += length + 12;
      }
    }
    // Keep every frame, its timing, transparency and loop settings unchanged.
    if ((metadata.pages || 1) > 1 || animatedPng) {
      return new Response(new Uint8Array(original),{headers:{'Content-Type':match[1],'Cache-Control':'no-store'}});
    }
    let bytes = cache.get(key);
    if (!bytes) {
      let job = pending.get(key);
      if (!job) {
        job = sharp(Buffer.from(match[2],'base64')).rotate().resize({width:480,height:480,fit:'inside',withoutEnlargement:true}).webp({quality:75}).toBuffer();
        pending.set(key,job);
      }
      try { bytes = await job; } finally { pending.delete(key); }
      if (cache.size >= 64) cache.delete(cache.keys().next().value!);
      cache.set(key,bytes);
    }
    return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'image/webp','Cache-Control':'no-store'}});
  } catch {
    return new Response(new Uint8Array(Buffer.from(match[2],'base64')),{headers:{'Content-Type':match[1],'Cache-Control':'no-store'}});
  }
}
