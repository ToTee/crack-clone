export function parseMediaFilename(filename: string) {
  const base = filename.replace(/\.[^.]+$/, '').trim();
  const separator = base.indexOf('_');
  return {
    category: (separator < 0 ? base : base.slice(0, separator)).trim() || '기본',
    situation: (separator < 0 ? '' : base.slice(separator + 1)).trim() || '일반',
  };
}

export function mediaMatrix<T extends { name: string; category?: string; situation?: string }>(items: T[]) {
  const categories: string[] = [];
  const situations: string[] = [];
  const cells = new Map<string, Map<string, T[]>>();
  for (const item of items) {
    const fallback = parseMediaFilename(item.name);
    const category = item.category?.trim() || fallback.category;
    const situation = item.situation?.trim() || fallback.situation;
    if (!cells.has(category)) { cells.set(category, new Map()); categories.push(category); }
    if (!situations.includes(situation)) situations.push(situation);
    const column = cells.get(category)!;
    if (!column.has(situation)) column.set(situation, []);
    column.get(situation)!.push(item);
  }
  const compare = new Intl.Collator('ko', { numeric: true }).compare;
  categories.sort(compare);
  situations.sort(compare);
  return { categories, situations, cells };
}
