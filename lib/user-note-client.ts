export async function loadUserNote(id: string) {
  const url = `/api/chats/${encodeURIComponent(id)}/note`;
  const response = await fetch(url, { cache: 'no-store' });
  let data = await response.json();
  if (!response.ok) throw new Error(data.error || '유저노트를 불러오지 못했습니다.');
  let legacy: string | null = null;
  try { legacy = localStorage.getItem(`user_note_${id}`); } catch {}
  if (data.note === null && legacy?.trim()) {
    const migrated = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'migrate', note: legacy }) });
    data = await migrated.json();
    if (!migrated.ok) throw new Error(data.error || '기존 유저노트를 NAS로 옮기지 못했습니다.');
  }
  return data as { note: string | null; revision: number };
}
