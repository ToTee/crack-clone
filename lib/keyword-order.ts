// Reorder only visible slots; hidden start-setting entries retain their positions.
export function reorderKeywordNotes<T extends {id:string}>(items:T[], visibleIds:string[], id:string, before:string|null):T[] {
  const visible = new Set(visibleIds);
  const rows = items.filter(item => visible.has(item.id));
  const moving = rows.find(item => item.id === id);
  if (!moving || before === id) return items;
  const rest = rows.filter(item => item.id !== id);
  const index = before === null ? rest.length : rest.findIndex(item => item.id === before);
  if (index < 0) return items;
  rest.splice(index,0,moving);
  let slot=0;
  return items.map(item => visible.has(item.id) ? rest[slot++] : item);
}
