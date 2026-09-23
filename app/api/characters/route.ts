import db from '@/lib/db';
import { listThumbnail } from '@/lib/list-thumbnail';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export async function GET(req: Request) {
  const summary = new URL(req.url).searchParams.get('summary') === '1';
  const rows = db.prepare(summary ? 'SELECT id,name,tagline,avatar,tags,editor_config FROM characters' : 'SELECT * FROM characters').all() as any[];
  const characters = summary ? rows.map(row => {
    let visibility: string | undefined;
    try { visibility = JSON.parse(row.editor_config || '{}')?.registration?.visibility; } catch {}
    return {id:row.id,name:row.name,tagline:row.tagline,avatar:listThumbnail(row.id,row.avatar),tags:row.tags,editor_config:JSON.stringify({registration:{visibility}})};
  }) : rows;
  return Response.json(characters,{headers:{'Cache-Control':'no-store'}});
}
