import { NextResponse } from 'next/server';
import db from '@/lib/db';
const key = 'nas_user_profiles_v1';
function valid(p: any) { return p && typeof p.id === 'string' && p.id && typeof p.name === 'string' && p.name.trim() && typeof p.label === 'string' && typeof p.info === 'string'; }
function read() {
  db.exec('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)');
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as any;
  return row ? JSON.parse(row.value) : { profiles: [], activeId: '', revision: 0, knownIds: [] };
}
function write(s: any) { db.prepare('INSERT OR REPLACE INTO app_settings (key,value) VALUES (?,?)').run(key, JSON.stringify(s)); }
function result(s: any) { return NextResponse.json({ profiles: s.profiles, activeId: s.activeId, revision: s.revision }, { headers: { 'Cache-Control': 'no-store' } }); }
function merge(s: any, profiles: any[]) {
  let changed = false;
  for (const p of profiles) if (valid(p) && !s.knownIds.includes(p.id)) {
    s.profiles.push({ id: p.id, label: p.label, name: p.name, info: p.info }); s.knownIds.push(p.id); changed = true;
  }
  if (!s.activeId && s.profiles.length) s.activeId = s.profiles[0].id;
  if (changed) { s.revision++; write(s); }
  return s;
}
export async function GET() {
  const state = db.transaction(() => {
    const s = read();
    // Recover profiles captured in existing chats. knownIds also retains deletions.
    const rows = db.prepare('SELECT user_profile FROM chat_sessions WHERE user_profile IS NOT NULL ORDER BY updated_at DESC').all() as any[];
    const profiles = rows.flatMap(row => { try { return [JSON.parse(row.user_profile)]; } catch { return []; } });
    return merge(s, profiles);
  })();
  return result(state);
}
export async function PATCH(req: Request) {
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 }); }
  return db.transaction(() => {
    const s = read();
    if (body.mode === 'migrate') return result(merge(s, Array.isArray(body.profiles) ? body.profiles : []));
    if (body.revision !== s.revision) return NextResponse.json({ error: '다른 화면에서 프로필이 변경됐어요. 목록을 다시 불러온 뒤 저장해 주세요.' }, { status: 409 });
    if (!Array.isArray(body.profiles) || body.profiles.some((p: any) => !valid(p)) || new Set(body.profiles.map((p: any) => p.id)).size !== body.profiles.length || typeof body.activeId !== 'string' || (body.activeId && !body.profiles.some((p: any) => p.id === body.activeId)))
      return NextResponse.json({ error: '프로필 내용을 확인해 주세요.' }, { status: 400 });
    if (body.sessionId && !db.prepare('SELECT id FROM chat_sessions WHERE id = ?').get(body.sessionId)) return NextResponse.json({ error: '채팅방을 찾을 수 없습니다.' }, { status: 404 });
    s.profiles = body.profiles.map((p: any) => ({ id: p.id, label: p.label, name: p.name, info: p.info }));
    s.knownIds = [...new Set([...s.knownIds, ...s.profiles.map((p: any) => p.id)])];
    s.activeId = body.activeId; s.revision++; write(s);
    if (body.sessionId) {
      const profile = s.profiles.find((p: any) => p.id === s.activeId);
      db.prepare('UPDATE chat_sessions SET user_profile = ? WHERE id = ?').run(profile ? JSON.stringify(profile) : null, body.sessionId);
    }
    return result(s);
  })();
}
