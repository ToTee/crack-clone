import { randomUUID } from 'crypto';
import db from '@/lib/db';
export const dynamic = 'force-dynamic';
function init() {
  db.exec(`CREATE TABLE IF NOT EXISTS personal_shortcuts(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,prompt TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0)`);
}
function valid(item: any) {
  return item && typeof item.name === 'string' && item.name.replace(/^\/+/, '').trim() && typeof item.desc === 'string' && typeof item.prompt === 'string' && item.prompt.trim();
}
function orderedShortcuts(characterId: string | null) {
  const personal = db.prepare("SELECT id,name,description AS 'desc',prompt,revision,'personal' AS source FROM personal_shortcuts ORDER BY rowid DESC").all();
  let creator: any[] = [];
  if (characterId) {
    const character = db.prepare('SELECT editor_config FROM characters WHERE id=?').get(characterId) as any;
    try {
      const config = JSON.parse(character?.editor_config || '{}');
      if (Array.isArray(config.shortcuts)) creator = config.shortcuts.filter(valid).map((s: any, i: number) => ({ id: `creator:${characterId}:${i}`, name: s.name, desc: s.desc, prompt: s.prompt, source: 'creator' }));
    } catch {}
  }
  const order = savedOrder();
  const rank = new Map(order.map((id: string, index: number) => [id, index]));
  return [...creator, ...personal].sort((a: any, b: any) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}
function savedOrder(): string[] {
  const row = db.prepare('SELECT value FROM app_settings WHERE key=?').get('shortcut_order') as any;
  try { const order = JSON.parse(row?.value || '[]'); return Array.isArray(order) ? order.filter((id: any) => typeof id === 'string') : []; } catch { return []; }
}
export async function GET(req: Request) {
  init();
  return Response.json({ shortcuts: orderedShortcuts(new URL(req.url).searchParams.get('characterId')) }, { headers: { 'Cache-Control': 'no-store' } });
}
async function mutate(req: Request) {
  init();
  let body: any;
  try { body = await req.json(); } catch { return Response.json({ error: '단축어 내용을 확인해 주세요.' }, { status: 400 }); }
  try {
    if (req.method === 'PATCH' && body.mode === 'reorder') {
      if (!Array.isArray(body.ids) || !Array.isArray(body.previousIds) || body.ids.some((id: any) => typeof id !== 'string') || new Set(body.ids).size !== body.ids.length || (body.characterId != null && typeof body.characterId !== 'string')) return Response.json({ error: '순서를 확인해 주세요.' }, { status: 400 });
      return db.transaction(() => {
        const current = orderedShortcuts(body.characterId || null).map((item: any) => item.id);
        if (JSON.stringify(current) !== JSON.stringify(body.previousIds)) return Response.json({ error: '목록이 변경됐습니다. 다시 열어 주세요.' }, { status: 409 });
        if (body.ids.length !== current.length || body.ids.some((id: string) => !current.includes(id))) return Response.json({ error: '순서를 확인해 주세요.' }, { status: 400 });
        const order = [...body.ids, ...savedOrder().filter(id => !current.includes(id))];
        db.prepare('INSERT INTO app_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('shortcut_order', JSON.stringify(order));
        return Response.json({ success: true });
      })();
    }
    if (req.method === 'POST' && body.mode === 'migrate') {
      if (typeof body.characterId !== 'string' || !Array.isArray(body.items)) return Response.json({ error: '이전할 단축어를 확인해 주세요.' }, { status: 400 });
      if (!db.prepare('SELECT id FROM characters WHERE id=?').get(body.characterId)) return Response.json({ error: '작품이 없습니다.' }, { status: 404 });
      db.transaction(() => {
        const key = `shortcuts_migrated:${body.characterId}`;
        if (db.prepare('SELECT key FROM app_settings WHERE key=?').get(key)) return;
        for (const item of body.items.filter(valid)) {
          if (!db.prepare('SELECT id FROM personal_shortcuts WHERE name=? AND description=? AND prompt=?').get(item.name.replace(/^\/+/, '').trim(),item.desc,item.prompt)) db.prepare('INSERT INTO personal_shortcuts(id,name,description,prompt) VALUES (?,?,?,?)').run(randomUUID(),item.name.replace(/^\/+/, '').trim(),item.desc,item.prompt);
        }
        db.prepare('INSERT INTO app_settings(key,value) VALUES (?,?)').run(key,'1');
      })();
      return Response.json({ success: true });
    }
    if (req.method !== 'DELETE' && !valid(body)) return Response.json({ error: '이름과 프롬프트를 입력해 주세요.' }, { status: 400 });
    if (req.method === 'POST') {
      const id = randomUUID();
      db.prepare('INSERT INTO personal_shortcuts(id,name,description,prompt) VALUES (?,?,?,?)').run(id,body.name.replace(/^\/+/, '').trim(),body.desc.trim(),body.prompt);
      return Response.json({ id });
    }
    if (typeof body.id !== 'string' || !Number.isSafeInteger(body.revision)) return Response.json({ error: '단축어를 다시 열어 주세요.' }, { status: 400 });
    const result = req.method === 'DELETE'
      ? db.prepare('DELETE FROM personal_shortcuts WHERE id=? AND revision=?').run(body.id,body.revision)
      : db.prepare('UPDATE personal_shortcuts SET name=?,description=?,prompt=?,revision=revision+1 WHERE id=? AND revision=?').run(body.name.replace(/^\/+/, '').trim(),body.desc.trim(),body.prompt,body.id,body.revision);
    return result.changes ? Response.json({ success: true }) : Response.json({ error: '다른 기기에서 변경되었거나 삭제됐습니다. 목록을 다시 열어 주세요.' }, { status: 409 });
  } catch { return Response.json({ error: 'NAS에 저장하지 못했습니다.' }, { status: 500 }); }
}
export const POST = mutate;
export const PATCH = mutate;
export const DELETE = mutate;
