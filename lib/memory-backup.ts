import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

// One-time consistent SQLite snapshot before the memory schema upgrade (includes WAL data).
export function backupBeforeMemoryUpgrade(db: Database.Database) {
  if (!db.name || db.name === ':memory:') return;
  const dir = path.join(path.dirname(db.name), 'backups');
  const target = path.join(dir, 'before-memory-v129.db');
  if (fs.existsSync(target)) return;
  fs.mkdirSync(dir, { recursive: true });
  const temporary = path.join(dir, `memory-v129-${randomUUID()}.tmp.db`);
  try {
    db.prepare('VACUUM INTO ?').run(temporary);
    fs.renameSync(temporary,target);
  } catch {
    try { fs.unlinkSync(temporary); } catch {}
    throw new Error('기억 업그레이드 전 백업에 실패했습니다. NAS 저장 공간과 data/backups 쓰기 권한을 확인해 주세요.');
  }
}
