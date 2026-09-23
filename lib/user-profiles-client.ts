import type { UserProfileItem } from '@/components/UserProfileModal';
export type ProfileState = { profiles: UserProfileItem[]; activeId: string; revision: number };
export async function profileRequest(body?: unknown): Promise<ProfileState> {
  const res = await fetch('/api/user-profiles', body ? { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'NAS 대화 프로필을 불러오지 못했어요.');
  return data;
}
export async function loadUserProfiles(): Promise<ProfileState> {
  let data = await profileRequest();
  let legacy: unknown;
  try { legacy = JSON.parse(localStorage.getItem('user_profiles') || '[]'); } catch {}
  if (Array.isArray(legacy) && legacy.length) data = await profileRequest({ mode: 'migrate', profiles: legacy });
  return data;
}
