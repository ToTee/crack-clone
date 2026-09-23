import db from '@/lib/db';
import { randomUUID } from 'node:crypto';
import { readMedia, validateMedia, writeMedia } from '@/lib/server-media';
import { parseEditorConfig } from '@/lib/prompt-templates';

const fields = ['name', 'tagline', 'avatar', 'system_prompt', 'first_message', 'tags', 'start_settings', 'editor_config'] as const;
export function exportWork(id: string) {
  const row = db.prepare('SELECT * FROM characters WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return { format: 'crack-clone-work', version: 1, exportedAt: new Date().toISOString(),
    work: Object.fromEntries(fields.map(key => [key, row[key] ?? (key === 'start_settings' ? '[]' : key === 'editor_config' ? null : '')])),
    media: readMedia(id).items };
}
export function importWork(value: unknown) {
  const file = value as any;
  if (!file || file.format !== 'crack-clone-work' || file.version !== 1 || !file.work || typeof file.work !== 'object') throw new Error('이 사이트에서 내보낸 작품 JSON 파일을 선택해 주세요.');
  const work = file.work;
  for (const key of fields) {
    if (key === 'editor_config' && work[key] === null) continue;
    if (typeof work[key] !== 'string') throw new Error('작품 설정 형식이 올바르지 않습니다.');
  }
  if (!work.name.trim()) throw new Error('작품 이름이 없습니다.');
  let starts: unknown;
  try { starts = JSON.parse(work.start_settings); } catch { throw new Error('시작 설정을 읽을 수 없습니다.'); }
  if (!Array.isArray(starts)) throw new Error('시작 설정 형식이 올바르지 않습니다.');
  if (work.editor_config !== null && !parseEditorConfig(work.editor_config)) throw new Error('편집 설정 형식이 올바르지 않습니다.');
  validateMedia(file.media);
  if (new Set(file.media.map((item: any) => item.id)).size !== file.media.length || file.media.some((item: any) => !item.id || item.url.startsWith('/api/characters/'))) throw new Error('중복된 이미지 ID 또는 원본이 없는 이미지 참조가 있습니다. 작품을 다시 내보내 주세요.');
  const id = `char_${Date.now()}_${randomUUID()}`;
  // Import as a new private work; never overwrite an existing work or its chats.
  const config = work.editor_config ? JSON.parse(work.editor_config) : null;
  if (config) config.registration = { ...config.registration, visibility: 'private' };
  db.transaction(() => {
    db.prepare(`INSERT INTO characters (id,${fields.join(',')}) VALUES (${Array(fields.length + 1).fill('?').join(',')})`)
      .run(id, ...fields.map(key => key === 'editor_config' ? (config ? JSON.stringify(config) : null) : work[key]));
    writeMedia(id, file.media, 0);
  })();
  return { id, name: work.name };
}
