import { chargeUsage, type UsageContext } from '@/lib/stars';
import db from '@/lib/db';
// Store provider-reported token counts only; these are not invoice estimates.
export function recordClaudeUsage(sessionId: string | undefined, model: string, usage: {input: number; output: number; write: number; read: number}, completed: boolean, context: UsageContext = {}) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS ai_token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      session_id TEXT, model TEXT NOT NULL, input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL, cache_write_tokens INTEGER NOT NULL,
      cache_read_tokens INTEGER NOT NULL, completed INTEGER NOT NULL)`);
    db.transaction(() => {
    const result = db.prepare('INSERT INTO ai_token_usage(session_id,model,input_tokens,output_tokens,cache_write_tokens,cache_read_tokens,completed) VALUES (?,?,?,?,?,?,?)')
      .run(sessionId || null, model, usage.input, usage.output, usage.write, usage.read, completed ? 1 : 0);
    chargeUsage(`usage-${result.lastInsertRowid}`, model, usage, completed, context);
    })();
  } catch { console.error('AI 사용량 기록 실패'); }
}
