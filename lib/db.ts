// lib/db.ts
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let dbInstance: Database.Database | null = null;

function initDb(): Database.Database {
  const dataDir = process.env.DB_DIR || path.join(process.cwd(), 'data');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'crack.db');
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      avatar TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      first_message TEXT NOT NULL,
      tags TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      title TEXT NOT NULL,
      start_setting_index INTEGER NOT NULL DEFAULT 0,
      user_profile TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const characterColumns = db.prepare('PRAGMA table_info(characters)').all() as Array<{ name: string }>;
  if (!characterColumns.some((column) => column.name === 'start_settings')) {
    db.exec("ALTER TABLE characters ADD COLUMN start_settings TEXT NOT NULL DEFAULT '[]'");
  }

  const messageColumns = db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>;
  if (!characterColumns.some((column) => column.name === 'editor_config')) {
    db.exec('ALTER TABLE characters ADD COLUMN editor_config TEXT');
  }
  if (!messageColumns.some((column) => column.name === 'session_id')) {
    db.exec('ALTER TABLE messages ADD COLUMN session_id TEXT');
  }
  // 채팅방별 메시지 조회(WHERE session_id=? ORDER BY id)를 전체 스캔 없이 처리.
  db.exec('CREATE INDEX IF NOT EXISTS messages_session_id ON messages(session_id, id)');

  const sessionColumns = db.prepare('PRAGMA table_info(chat_sessions)').all() as Array<{ name: string }>;
  if (!sessionColumns.some(column => column.name === 'has_started')) {
    db.exec('ALTER TABLE chat_sessions ADD COLUMN has_started INTEGER NOT NULL DEFAULT 0');
    db.exec("UPDATE chat_sessions SET has_started=1 WHERE EXISTS (SELECT 1 FROM messages WHERE messages.session_id=chat_sessions.id AND role='user')");
  }

  if (!sessionColumns.some(column => column.name === 'user_note')) db.exec('ALTER TABLE chat_sessions ADD COLUMN user_note TEXT');
  if (!sessionColumns.some(column => column.name === 'note_revision')) db.exec('ALTER TABLE chat_sessions ADD COLUMN note_revision INTEGER NOT NULL DEFAULT 0');

  const legacyCharacters = db.prepare(`
    SELECT DISTINCT c.id, c.name
    FROM characters c
    JOIN messages m ON m.character_id = c.id
    WHERE m.session_id IS NULL
  `).all() as Array<{ id: string; name: string }>;

  const createLegacySession = db.prepare(`
    INSERT OR IGNORE INTO chat_sessions (id, character_id, title, start_setting_index)
    VALUES (?, ?, ?, 0)
  `);
  const attachLegacyMessages = db.prepare(`
    UPDATE messages SET session_id = ? WHERE character_id = ? AND session_id IS NULL
  `);

  db.transaction(() => {
    for (const character of legacyCharacters) {
      const sessionId = `legacy_${character.id}`;
      createLegacySession.run(sessionId, character.id, `${character.name} · 기존 채팅`);
      attachLegacyMessages.run(sessionId, character.id);
    }
  })();

  return db;
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = initDb();
  }
  return dbInstance;
}

const db = new Proxy({} as Database.Database, {
  get(_target, prop) {
    const instance = getDb();
    const value = Reflect.get(instance, prop);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

export default db;
