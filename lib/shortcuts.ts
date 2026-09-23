export type ChatShortcut = { id: string; name: string; desc: string; prompt: string; source: 'personal' | 'creator'; revision?: number };
export function filterShortcuts(items: ChatShortcut[], input: string, source = 'all') {
  const query = input.replace(/^\s*\//, '').trim().normalize('NFC').toLocaleLowerCase();
  return items.filter(item => (source === 'all' || item.source === source) &&
    (!query || `${item.name}\n${item.desc}`.normalize('NFC').toLocaleLowerCase().includes(query)));
}
export const shortcutMessage = (item: ChatShortcut) => `[명령: /${item.name}]\n${item.prompt}`;

// Only collapse the exact envelope emitted by shortcutMessage; keep stored content intact.
export function shortcutLabel(content: string): string | null {
  const match = content.match(/^\[명령: \/([^\]\r\n]+)\]\r?\n/);
  return match ? `/${match[1]}` : null;
}
