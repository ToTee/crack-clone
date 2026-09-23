// Accept common presentation variations without treating arbitrary prose as choices.
export function parseSuggestedReplies(raw: string): string[] | null {
  const validate = (value: unknown): string[] | null => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      value = record.replies ?? record.suggestedReplies ?? record.suggestions ?? record.options;
    }
    if (!Array.isArray(value) || value.length !== 3) return null;
    const replies = value.map(item => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        const text = item.text ?? item.reply ?? item.content;
        return typeof text === 'string' ? text.trim() : '';
      }
      return '';
    });
    // Length is a generation preference, not a reason to discard a usable answer.
    return replies.every(Boolean) && new Set(replies).size === 3 ? replies : null;
  };
  const text = raw.trim();
  try { const result = validate(JSON.parse(text)); if (result) return result; } catch {}
  // Find balanced JSON blocks even when fenced or surrounded by an explanation.
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '[' && text[start] !== '{') continue;
    const stack: string[] = []; let quoted = false; let escaped = false;
    for (let end = start; end < text.length; end++) {
      const ch = text[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') quoted = false;
        continue;
      }
      if (ch === '"') { quoted = true; continue; }
      if (ch === '[' || ch === '{') stack.push(ch);
      else if (ch === ']' || ch === '}') {
        if (stack.pop() !== (ch === ']' ? '[' : '{')) break;
        if (!stack.length) {
          try { const result = validate(JSON.parse(text.slice(start, end + 1))); if (result) return result; } catch {}
          break;
        }
      }
    }
  }
  const lines = text.split(/\r?\n/);
  const numbered = lines.map(line => line.match(/^\s*(?:\*\*)?([1-3])[.)、]\s*(?:\*\*)?\s*(.+?)\s*$/)).filter(Boolean);
  if (numbered.length === 3 && numbered.every((match, i) => Number(match![1]) === i + 1))
    return validate(numbered.map(match => match![2]));
  const bullets = lines.map(line => line.match(/^\s*[-•]\s+(.+?)\s*$/)).filter(Boolean);
  return bullets.length === 3 ? validate(bullets.map(match => match![1])) : null;
}
