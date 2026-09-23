import { parseEditorConfig } from '@/lib/prompt-templates';

export function withoutKeywordBook(character: { system_prompt: string; editor_config?: string | null }) {
  const config = parseEditorConfig(character.editor_config);
  if (!Array.isArray(config?.keywords) || !config.keywords.length) return character;
  // Remove only the exact auto-generated legacy block, never arbitrary author text.
  const block = `\n\n[키워드북 정보]\n${config.keywords.map((k: any) => `[${k.title}] 키워드(${Array.isArray(k.keywords) ? k.keywords.join(', ') : ''}): ${k.info}`).join('\n')}`;
  const index = character.system_prompt.lastIndexOf(block);
  return index < 0 ? character : { ...character, system_prompt: character.system_prompt.slice(0, index) + character.system_prompt.slice(index + block.length) };
}

export type DirectKeywordSource = { text: string; label: string; exact: boolean };
export type KeywordSelection = { mode?: 'general' | 'direct'; title: string; chars: number; matches?: Array<{ keyword: string; sources: string[] }> };

// Direct-mode user mentions: a name starts at a word boundary and may end
// with a Korean particle. Never match a name buried inside 열린다 / 들린다.
const nameParticles = new Set([
  '이', '가', '은', '는', '을', '를', '의', '도', '만', '과', '와', '랑', '이랑',
  '에게', '한테', '께', '에게서', '한테서', '에서', '에', '로', '으로',
  '부터', '까지', '보다', '처럼', '같이', '조차', '마저', '밖에', '아', '야',
  '이라고', '라고', '이라는', '라는', '이랑은', '랑은', '과는', '와는',
  '에게는', '에게도', '에게만', '한테는', '한테도', '한테만', '께서', '께서는',
  '으로는', '로는', '만은', '만이', '만을', '이야', '야말로', '이야말로',
]);

function mentionsName(text: string, name: string): boolean {
  if (!name) return false;
  for (let at = text.indexOf(name); at !== -1; at = text.indexOf(name, at + 1)) {
    if (/[\p{L}\p{M}\p{N}_]$/u.test(text.slice(0, at))) continue;
    const suffix = text.slice(at + name.length).match(/^[\p{L}\p{M}\p{N}_]*/u)![0];
    if (!suffix || nameParticles.has(suffix)) return true;
  }
  return false;
}

export function keywordInstructions(editorConfig: unknown, settingId: number, recent: string[], selectedItems?: KeywordSelection[], sourceLabels?: string[], directSources: DirectKeywordSource[] = []): string {
  const config = parseEditorConfig(editorConfig);
  if (!Array.isArray(config?.keywords)) return '';
  const scope = settingId === 1 ? 'extra1' : settingId === 2 ? 'extra2' : 'default';
  const normalize = (text: string) => text.normalize('NFC').toLocaleLowerCase();
  const context = recent.map(normalize);
  const matchingSources = (note: any, keyword: string) => note.triggerMode === 'direct'
    ? directSources.filter(source => source.exact ? normalize(source.text.trim()) === normalize(keyword.trim()) : mentionsName(normalize(source.text), normalize(keyword.trim()))).map(source => source.label)
    : context.flatMap((text, index) => text.includes(normalize(keyword.trim())) ? [sourceLabels?.[index] || `검사 대상 ${index + 1}`] : []);
  const seen = new Set<string>();
  const selected = config.keywords.filter((note: any) => {
    if (!note || typeof note.info !== 'string' || !note.info.trim() || !Array.isArray(note.keywords)) return false;
    if (Array.isArray(note.appliedTargets) && !note.appliedTargets.includes(scope) && !note.appliedTargets.includes('all')) return false;
    return note.keywords.some((key: unknown) => typeof key === 'string' && key.trim() && matchingSources(note, key).length > 0);
  });
  const unique = selected.filter((note: any) => {
    const text = normalize(note.info.trim());
    if (seen.has(text)) return false;
    seen.add(text); return true;
  });
  if (selectedItems) selectedItems.push(...unique.map((note: any) => ({ mode: note.triggerMode === 'direct' ? 'direct' as const : 'general' as const, title: note.title || '설정', chars: Array.from(note.info).length,
    matches: [...new Set<string>(note.keywords.filter((key: unknown): key is string => typeof key === 'string' && !!key.trim()))].flatMap(keyword => {
      const sources = matchingSources(note, keyword);
      return sources.length ? [{ keyword, sources }] : [];
    }),
  })));
  if (!unique.length) return '';
  return '\n\n[현재 대화 관련 키워드북]\n아래는 현재 장면에 참고할 설정 자료입니다. 현재 대화의 시간과 장소를 과거 장면으로 되돌리지 마세요.\n' + unique.map((note: any) => `[${note.title || '설정'}]\n${note.info}`).join('\n\n');
}

// Search-only view: never mutate stored history or the text sent to the model.
export function keywordSearchText(text: string, role: string, excludeStatus: boolean, statuses?: string[]) {
  if (role !== 'assistant' || !excludeStatus) return text;
  let fence: { marker: string; length: number; status: boolean } | null = null;
  const kept: string[] = [];
  for (const line of text.split(/(?<=\n)/)) {
    const value = line.replace(/[\r\n]+$/, '');
    if (fence) {
      const close = value.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
      const closing = close && close[1][0] === fence.marker && close[1].length >= fence.length;
      if (!fence.status) kept.push(line);
      else if (!closing) statuses?.push(line);
      if (closing) { if (fence.status) kept.push('\n'); fence = null; }
      continue;
    }
    const open = value.match(/^ {0,3}(`{3,}|~{3,})[ \t]*([^\r\n]*)$/);
    if (open) {
      const label = open[2].trim();
      fence = { marker: open[1][0], length: open[1].length, status: /^(?:상태창|info|status)$/i.test(label) };
      if (!fence.status) kept.push(line);

    } else kept.push(line);
  }
  return kept.join('');
}

// Messages must be newest first, matching the chat route's history query.
export function directKeywordSources(recent: Array<{ role: string; content: string }>, currentInput: string): DirectKeywordSource[] {
  const sources: DirectKeywordSource[] = [{ text: currentInput, label: '이번 사용자 입력', exact: false }];
  let latestAssistant = true;
  recent.forEach((message, index) => {
    const label = `직전 ${index + 1}번째 메시지`;
    if (message.role === 'user') {
      sources.push({ text: message.content, label: `${label} · 사용자 입력`, exact: false });
      return;
    }
    if (message.role !== 'assistant') return;
    const statuses: string[] = [];
    const body = keywordSearchText(message.content, 'assistant', true, statuses);
    // Recognize the app's speaker formats, not names mentioned inside narration.
    for (const line of body.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:\*\*([^*|\n]+)\*\*\s*[|｜]|\|\s*([^|\n]+?)\s*\||([^*|<>\n]{1,60})\s*[|｜])/);
      const name = (match?.[1] || match?.[2] || match?.[3] || '').replace(/^\*\*|\*\*$/g, '').trim();
      if (name) sources.push({ text: name, label: `${label} · AI 대사 인물`, exact: true });
    }
    if (latestAssistant) {
      for (const match of statuses.join('').matchAll(/^\s*《\s*([^》\n]+?)\s*》/gm)) sources.push({ text: match[1], label: `${label} · 최신 상태창 현재 인물`, exact: true });
      latestAssistant = false;
    }
  });
  return sources;
}
