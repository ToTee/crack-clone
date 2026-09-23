// Temporary in-memory view data only; NAS remains the source of truth.
const values = new Map<string, any[]>();
const pending = new Map<string, Promise<any[]>>();
export function peekList(url: string): any[] { return values.get(url) || []; }
export function setList(url: string, rows: any[]) { values.set(url, rows); }
export function loadList(url: string): Promise<any[]> {
  const existing = pending.get(url);
  if (existing) return existing;
  const job = fetch(url,{cache:'no-store'}).then(async response => {
    if (!response.ok) throw new Error('목록을 불러오지 못했습니다. 다시 시도해 주세요.');
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('목록 응답을 확인할 수 없습니다.');
    values.set(url,rows); return rows;
  }).finally(() => pending.delete(url));
  pending.set(url,job); return job;
}
