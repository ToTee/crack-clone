'use client';
import { useEffect, useState } from 'react';
import { loadUserProfiles } from './user-profiles-client';
import { replaceUserName } from './chat-media';

export function usePreviewProfile() {
  const [name, setName] = useState<string>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const state = await loadUserProfiles();
        if (active) {
          setName(state.profiles.find(profile => profile.id === state.activeId)?.name || '사용자');
          setError('');
        }
      } catch {
        if (active) setError('대화프로필을 불러오지 못했어요. 화면을 다시 열어 주세요.');
      }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, []);
  return { error, display: (text: string) => name === undefined ? text : replaceUserName(text, name) };
}
