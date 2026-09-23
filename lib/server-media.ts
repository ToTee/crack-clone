import { imageByteSize } from '@/lib/media-file-info';
import db from '@/lib/db';
const mediaCache = new Map<string, {items:any[];revision:number;initialized:boolean}>();
export function mediaUrl(id: string, itemId: string, revision: number) { return `/api/characters/${encodeURIComponent(id)}/media/${encodeURIComponent(itemId)}?revision=${revision}`; }
export function compactMedia(id: string, data: ReturnType<typeof readMedia>) { return {...data,items:data.items.map((item:any)=>({...item,sizeBytes:imageByteSize(item.url) ?? item.sizeBytes,url:item.url.startsWith('data:image/')?mediaUrl(id,item.id,data.revision):item.url}))}; }
export function initMedia() {
  db.exec('CREATE TABLE IF NOT EXISTS character_media (character_id TEXT PRIMARY KEY, items TEXT NOT NULL, revision INTEGER NOT NULL)');
  const columns = db.prepare('PRAGMA table_info(character_media)').all() as { name: string }[];
  if (!columns.some(column => column.name === 'scope_version')) db.exec('ALTER TABLE character_media ADD COLUMN scope_version INTEGER NOT NULL DEFAULT 0');
}
export function readMedia(id: string) {
  initMedia();
  const header = db.prepare('SELECT revision,scope_version FROM character_media WHERE character_id=?').get(id) as any;
  const cached = mediaCache.get(id);
  if (cached && header?.scope_version && cached.revision === header.revision) return cached;
  return db.transaction(() => {
    const row = db.prepare('SELECT * FROM character_media WHERE character_id = ?').get(id) as any;
    if (!row) return { items: [], revision: 0, initialized: false };
    let items = JSON.parse(row.items);
    if (!row.scope_version) {
      items = items.map((item: any) => ({ ...item, targetScope: 'all' }));
      row.revision += 1;
      db.prepare('UPDATE character_media SET items = ?, revision = ?, scope_version = 1 WHERE character_id = ?').run(JSON.stringify(items), row.revision, id);
    }
    const result = { items, revision: row.revision, initialized: true };
    if (mediaCache.size >= 3) mediaCache.delete(mediaCache.keys().next().value!);
    mediaCache.set(id,result);
    return result;
  })();
}
export function validateMedia(items: any) {
  if (!Array.isArray(items) || items.length > 2000 || items.some((m: any) => !m || typeof m.id !== 'string' || typeof m.name !== 'string' || typeof m.url !== 'string' || !(/^(data:image\/|https?:\/\/)/i.test(m.url) || m.url.startsWith('/api/characters/')))) throw new Error('미디어 목록을 확인해 주세요.');
}
export function writeMedia(id: string, items: any[], revision: number) {
  validateMedia(items); const current = readMedia(id);
  if (revision !== current.revision) throw new Error('다른 기기에서 미디어가 변경됐습니다. 수정 화면을 다시 열어 주세요.');
  const originals = new Map<string, any>(current.items.map((item: any) => [item.id, item]));
  items = items.map(item => {
    if (!item.url.startsWith('/api/characters/')) return item;
    const original = originals.get(item.id);
    if (!original || item.url !== mediaUrl(id, original.id, current.revision)) throw new Error('이미지 참조가 변경됐습니다. 수정 화면을 다시 열어 주세요.');
    return {...item,url:original.url};
  });
  db.prepare('INSERT OR REPLACE INTO character_media (character_id,items,revision,scope_version) VALUES (?,?,?,1)').run(id, JSON.stringify(items), current.revision + 1);
}
