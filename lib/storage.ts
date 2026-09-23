// NAS is the source of truth. IndexedDB is read only to migrate existing media.
const revisions = new Map<string, number>();
async function request(characterId: string, body?: unknown) {
  const res = await fetch(`/api/characters/${encodeURIComponent(characterId)}/media?compact=1`, body ? { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  let data: any;
  try { data = await res.json(); } catch { throw new Error(`NAS 미디어 요청 실패 (HTTP ${res.status}). 서버 연결과 업로드 크기 제한을 확인해 주세요.`); }
  if (!res.ok) throw new Error(data.error || 'NAS 미디어 저장/불러오기에 실패했습니다.');
  revisions.set(characterId, data.revision);
  return data;
}
async function legacyMedia(characterId: string): Promise<any[]> {
  if (typeof indexedDB === 'undefined') return [];
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('CrackMediaDB', 1);
    req.onerror = () => reject(new Error('브라우저의 기존 사진을 읽지 못했습니다. 사이트 데이터 접근을 확인해 주세요.'));
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('media_store')) { db.close(); resolve([]); return; }
      const tx = db.transaction('media_store', 'readonly');
      const get = tx.objectStore('media_store').get(`media_${characterId}`);
      get.onsuccess = () => resolve(Array.isArray(get.result) ? get.result : []);
      get.onerror = () => reject(new Error('기존 미디어를 읽지 못했습니다.'));
      tx.oncomplete = () => db.close();
      tx.onabort = () => { db.close(); reject(new Error('기존 미디어 읽기가 중단됐습니다.')); };
    };
  });
}
export async function getMediaListFromDB(characterId: string): Promise<any[]> {
  let data = await request(characterId);
  if (!data.initialized) {
    const legacy = await legacyMedia(characterId);
    if (legacy.length) data = await request(characterId, { mode: 'migrate', items: legacy.map(item => ({ ...item, targetScope: 'all' })) });
  }
  return data.items;
}
export async function saveMediaListToDB(characterId: string, items: any[]): Promise<void> {
  if (!revisions.has(characterId)) await request(characterId);
  await request(characterId, { items, revision: revisions.get(characterId) });
}

export function mediaRevision(id: string) { return revisions.get(id); }
