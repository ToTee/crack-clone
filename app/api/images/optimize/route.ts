import { losslessImage } from '@/lib/lossless-image';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  if (!req.headers.get('content-type')?.startsWith('image/')) return new Response(null,{status:415});
  const input = Buffer.from(await req.arrayBuffer());
  if (!input.length || input.length > 32 * 1024 * 1024) return new Response(null,{status:204});
  const result = await losslessImage(input);
  if (!result) return new Response(null,{status:204});
  return new Response(new Uint8Array(result.bytes),{headers:{'Content-Type':result.type,'Cache-Control':'no-store'}});
}
