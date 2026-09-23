// A short-lived, single-use navigation prefetch. Never persisted in the browser.
const pending = new Map<string, { at: number; promise: Promise<any> }>();
function request(id: string) {
  return fetch(`/api/characters/${encodeURIComponent(id)}?view=info`, {cache:'no-store'}).then(async response => {
    const data = await response.json();
    if (!response.ok || !data.character) throw new Error(data.error || '작품 정보를 불러오지 못했습니다.');
    return data.character;
  });
}
export function prefetchCharacterInfo(id: string) {
  if (pending.has(id) && Date.now() - pending.get(id)!.at < 15000) return;
  if (pending.size >= 4) pending.delete(pending.keys().next().value!);
  const entry = {at:Date.now(), promise:request(id)};
  pending.set(id, entry);
  entry.promise.catch(() => { if (pending.get(id) === entry) pending.delete(id); });
}
export function loadCharacterInfo(id: string) {
  const entry = pending.get(id);
  pending.delete(id);
  return entry && Date.now() - entry.at < 15000 ? entry.promise : request(id);
}
