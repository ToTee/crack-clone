import { createHash } from 'crypto';
export function listThumbnail(id: string, avatar: string) {
  if (!avatar?.startsWith('data:image/')) return avatar;
  const version = createHash('sha1').update(avatar).digest('hex').slice(0,16);
  return `/api/characters/${encodeURIComponent(id)}/thumbnail?v=${version}`;
}
