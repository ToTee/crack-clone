import db from '@/lib/db';
import { randomUUID } from 'crypto';
function init() {
  db.exec(`CREATE TABLE IF NOT EXISTS chat_generation (
    session_id TEXT PRIMARY KEY, token TEXT NOT NULL, status TEXT NOT NULL,
    user_content TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS chat_generation_stops (session_id TEXT NOT NULL, token TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(session_id,token));`);
  if (!(db.prepare('PRAGMA table_info(chat_generation)').all() as any[]).some(row => row.name === 'replace_message_id')) db.exec('ALTER TABLE chat_generation ADD COLUMN replace_message_id INTEGER');
}
export function generationState(id: string): any {
  init();
  db.prepare("UPDATE chat_generation SET status='error', error='생성이 중단됐습니다. 다시 시도해 주세요.' WHERE session_id=? AND status IN ('running','stopping') AND updated<?").run(id, Date.now()-600000);
  return db.prepare('SELECT status,user_content,content,error,token,replace_message_id FROM chat_generation WHERE session_id=?').get(id) || null;
}
export function claimGeneration(id: string, content: string, requestToken?: string, replaceMessageId?: number): string | null {
  init();
  return db.transaction(() => {
    if (['running','stopping'].includes(generationState(id)?.status)) return null;
    const token = requestToken || randomUUID();
    if (db.prepare('SELECT token FROM chat_generation WHERE session_id=? AND token=?').get(id,token)) return null;
    db.prepare("INSERT OR REPLACE INTO chat_generation(session_id,token,status,user_content,updated,replace_message_id) VALUES (?,?,'running',?,?,?)").run(id,token,content,Date.now(),replaceMessageId ?? null);
    return token;
  })();
}
export function requestGenerationStop(id: string, token: string) {
  init();
  db.transaction(() => {
    db.prepare('DELETE FROM chat_generation_stops WHERE created<?').run(Date.now()-86400000);
    db.prepare('INSERT OR IGNORE INTO chat_generation_stops(session_id,token,created) VALUES (?,?,?)').run(id,token,Date.now());
    db.prepare("UPDATE chat_generation SET status='stopping' WHERE session_id=? AND token=? AND status='running'").run(id,token);
  })();
}
export function generationStopRequested(id: string, token: string) {
  return !!db.prepare('SELECT token FROM chat_generation_stops WHERE session_id=? AND token=?').get(id,token);
}
export function updateGeneration(id: string, token: string, content: string, status = 'running', error = '') {
  db.prepare("UPDATE chat_generation SET content=?,status=CASE WHEN status='stopping' AND ?='running' THEN status ELSE ? END,error=?,updated=? WHERE session_id=? AND token=?").run(content,status,status,error,Date.now(),id,token);
}
