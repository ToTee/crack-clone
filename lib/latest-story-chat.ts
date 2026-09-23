import db from '@/lib/db';

// Viewing a room or editing a message must not make it the last played room.
// Generation timestamps also cover an answer that is still being streamed.
export function latestStoryChat(characterId: string): { id: string; title: string } | null {
  const hasGenerations = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='chat_generation'").get());
  const chat = db.prepare(`
    WITH message_activity AS (
      SELECT session_id,
        CAST(ROUND((julianday(MAX(created_at)) - 2440587.5) * 86400000) AS INTEGER) AS last_message_at
      FROM messages
      WHERE session_id IN (SELECT id FROM chat_sessions WHERE character_id = ?)
      GROUP BY session_id
      HAVING SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) > 0
    ), rooms AS (
      SELECT s.id, s.title, s.created_at,
        MAX(COALESCE(m.last_message_at, 0), ${hasGenerations ? 'COALESCE(g.updated, 0)' : '0'}) AS last_chat_at
      FROM chat_sessions s
      LEFT JOIN message_activity m ON m.session_id = s.id
      ${hasGenerations ? 'LEFT JOIN chat_generation g ON g.session_id = s.id' : ''}
      WHERE s.character_id = ?
    )
    SELECT id, title FROM rooms
    ORDER BY last_chat_at DESC,
      CASE WHEN last_chat_at = 0 THEN created_at END DESC,
      created_at ASC, id ASC
    LIMIT 1
  `).get(characterId, characterId) as { id: string; title: string } | undefined;
  return chat || null;
}
