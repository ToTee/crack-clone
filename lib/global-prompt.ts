import db from '@/lib/db';
import { createHash } from 'node:crypto';
import { combineGlobalPromptSections, emptyGlobalPromptSections, isGlobalPromptSections, type GlobalPromptSections } from '@/lib/global-prompt-sections';

const KEY = 'global_story_prompt';
const SECTIONS_KEY = 'global_story_prompt_sections_v1';

export function getGlobalPromptState() {
  const rows = db.prepare('SELECT key, value FROM app_settings WHERE key IN (?, ?)').all(KEY, SECTIONS_KEY) as { key: string; value: string }[];
  const prompt = rows.find(row => row.key === KEY)?.value || '';
  const stored = rows.find(row => row.key === SECTIONS_KEY)?.value || '';
  let sections = { ...emptyGlobalPromptSections(), general: prompt };
  let legacy = true;
  try {
    const parsed = JSON.parse(stored);
    // An older install may have updated only the original string. Never revive stale sections.
    if (parsed.version === 1 && isGlobalPromptSections(parsed.sections) && combineGlobalPromptSections(parsed.sections) === prompt) {
      sections = parsed.sections;
      legacy = false;
    }
  } catch {}
  const revision = createHash('sha256').update(JSON.stringify([prompt, stored])).digest('hex');
  return { prompt, sections, revision, legacy };
}

export function getGlobalPrompt(): string {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(KEY) as { value: string } | undefined;
  return row?.value || '';
}
function writeSetting(key: string, value: string) {
  db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`).run(key, value);
}

export function saveGlobalPromptSections(sections: GlobalPromptSections, revision: string) {
  return db.transaction(() => {
    if (getGlobalPromptState().revision !== revision) return null;
    writeSetting(KEY, combineGlobalPromptSections(sections));
    writeSetting(SECTIONS_KEY, JSON.stringify({ version: 1, sections }));
    return getGlobalPromptState();
  })();
}

// Old clients can still save a legacy string, but cannot flatten already-separated fields.
export function saveGlobalPrompt(prompt: string, previous: string): boolean {
  return db.transaction(() => {
    const state = getGlobalPromptState();
    if (!state.legacy || state.prompt !== previous) return false;
    writeSetting(KEY, prompt);
    return true;
  })();
}
export function globalPromptInstructions(): string {
  const prompt = getGlobalPrompt();
  return prompt.trim() ? `\n\n[전체 작품 공통 프롬프트]\n${prompt}\n[공통 프롬프트 끝]\n` : '';
}
