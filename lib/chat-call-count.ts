import db from '@/lib/db';

// Independent of message history: deleting/replacing messages never decrements this counter.
export function initChatCallCounts() {
  db.exec(`CREATE TABLE IF NOT EXISTS chat_call_counts (
    session_id TEXT PRIMARY KEY,
    baseline INTEGER NOT NULL DEFAULT 0,
    calls INTEGER NOT NULL DEFAULT 0
  )`);
  db.prepare(`INSERT OR IGNORE INTO chat_call_counts(session_id, baseline)
    SELECT s.id, COUNT(m.id) FROM chat_sessions s
    LEFT JOIN messages m ON m.session_id = s.id AND m.role = 'user'
    GROUP BY s.id`).run();
}

export function recordChatCall(sessionId: string) {
  db.transaction(() => {
    initChatCallCounts();
    db.prepare('UPDATE chat_call_counts SET calls = calls + 1 WHERE session_id = ?').run(sessionId);
  })();
}
