// components/UserProfileModal.tsx
'use client';

import { loadUserProfiles, profileRequest } from '@/lib/user-profiles-client';
import { useState, useEffect, useRef } from 'react';
import { X, Plus, Check, Trash2, Edit2 } from 'lucide-react';

export interface UserProfileItem {
  id: string;
  label: string; // 표기 (프로필 제목, 20자)
  name: string;  // 작품 내에서 나를 부를 이름 (20자)
  info: string;  // 성격, 신체정보 등 (1000자)
}

interface Props {
  sessionId?: string;
  selectedProfileId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectProfile?: (profile: UserProfileItem | null) => void;
}

export default function UserProfileModal({ isOpen, onClose, onSelectProfile, sessionId, selectedProfileId }: Props) {
  const [profiles, setProfiles] = useState<UserProfileItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  
  // 폼 모드 ('list' | 'add' | 'edit')
  const [mode, setMode] = useState<'list' | 'add' | 'edit'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);

  // 폼 입력 상태
  const [formLabel, setFormLabel] = useState('');
  const [formName, setFormName] = useState('');
  const [formInfo, setFormInfo] = useState('');

  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const reload = async () => {
    setReady(false); setError('');
    try { const data = await loadUserProfiles(); setProfiles(data.profiles); setSelectedId(selectedProfileId ?? data.activeId); setRevision(data.revision); setReady(true); }
    catch (e) { setError(e instanceof Error ? e.message : '불러오기 실패'); }
  };
  useEffect(() => { if (isOpen) { setMode('list'); void reload(); } }, [isOpen]);
  const saveProfilesToStorage = async (updated: UserProfileItem[], activeId: string) => {
    if (lock.current || !ready) return false;
    lock.current = true; setBusy(true); setError('');
    try {
      const data = await profileRequest({ profiles: updated, activeId, revision, sessionId });
      setProfiles(data.profiles); setSelectedId(data.activeId); setRevision(data.revision);
      onSelectProfile?.(data.profiles.find(p => p.id === data.activeId) || null);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : '저장 실패'); return false; }
    finally { lock.current = false; setBusy(false); }
  };
  const handleSelect = async (profile: UserProfileItem) => { await saveProfilesToStorage(profiles, profile.id); };
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy || !ready || !confirm('이 대화 프로필을 삭제하시겠습니까?')) return;
    const updated = profiles.filter(p => p.id !== id);
    await saveProfilesToStorage(updated, selectedId === id ? updated[0]?.id || '' : selectedId);
  };

  // 수정 모드로 진입
  const handleOpenEdit = (profile: UserProfileItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(profile.id);
    setFormLabel(profile.label || '');
    setFormName(profile.name || '');
    setFormInfo(profile.info || '');
    setMode('edit');
  };

  // 신규 추가 모드로 진입
  const handleOpenAdd = () => {
    setEditingId(null);
    setFormLabel('');
    setFormName('');
    setFormInfo('');
    setMode('add');
  };

  // 저장 (추가 또는 수정 완료)
  const handleSave = async () => {
    if (busy || !ready) return;
    if (!formName.trim()) {
      alert('이름(호칭)은 필수 항목입니다.');
      return;
    }

    if (mode === 'add') {
      // 신규 추가
      const newItem: UserProfileItem = {
        id: crypto.randomUUID(),
        label: formLabel.trim() || formName.trim(),
        name: formName.trim(),
        info: formInfo.trim(),
      };
      const updated = [...profiles, newItem];
      if (!await saveProfilesToStorage(updated, newItem.id)) return;
    } else if (mode === 'edit' && editingId) {
      // 기존 프로필 수정
      const updated = profiles.map((p) =>
        p.id === editingId
          ? {
              ...p,
              label: formLabel.trim() || formName.trim(),
              name: formName.trim(),
              info: formInfo.trim(),
            }
          : p
      );
      if (!await saveProfilesToStorage(updated, editingId)) return;
    }

    setMode('list');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 text-gray-900 relative">
        
        {/* 상단 헤더 */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <h3 className="font-bold text-base text-gray-900">
            {mode === 'add' ? '대화 프로필 추가' : mode === 'edit' ? '대화 프로필 수정' : '대화 프로필'}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-900 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500">{busy ? 'NAS에 저장 중…' : ready ? 'NAS에 저장 · 모든 기기에서 사용' : 'NAS에서 불러오는 중…'}</p>
        {error && <p role="alert" className="text-sm text-red-600">{error} <button type="button" disabled={busy} onClick={reload} className="underline">다시 불러오기</button></p>}
        <fieldset disabled={busy || !ready} className="min-w-0">
        {/* 1. 프로필 목록 보기 화면 */}
        {mode === 'list' ? (
          <div className="space-y-3.5">
            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {profiles.length === 0 ? (
                <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-8 text-center text-xs text-gray-500">
                  등록된 대화 프로필이 없습니다. 아래 버튼을 눌러 추가하세요.
                </div>
              ) : (
                profiles.map((item) => {
                  const isSelected = selectedId === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => { if (!busy && ready) void handleSelect(item); }}
                      className={`p-4 rounded-xl border cursor-pointer transition space-y-2 relative ${
                        isSelected
                          ? 'bg-gray-100 border-sky-500/60 shadow-md ring-1 ring-sky-500/30'
                          : 'bg-gray-50 border-gray-100 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-gray-900">{item.label}</span>
                          <span className="text-[11px] text-sky-600 bg-sky-50 px-2 py-0.5 rounded">
                            호칭: {item.name}
                          </span>
                        </div>
                        
                        {/* ✏️ 수정 / 🗑️ 삭제 / ✔️ 선택 뱃지 */}
                        <div className="flex items-center gap-1.5">
                          {isSelected && <Check className="w-4 h-4 text-sky-600 mr-1" />}
                          <button
                            type="button"
                            onClick={(e) => handleOpenEdit(item, e)}
                            className="p-1.5 text-gray-500 hover:text-sky-300 hover:bg-white/5 rounded-lg transition"
                            title="프로필 수정"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(item.id, e)}
                            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-white/5 rounded-lg transition"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {item.info && (
                        <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap bg-gray-50 p-2.5 rounded-lg border border-gray-100 line-clamp-3">
                          {item.info}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* 프로필 추가 버튼 */}
            <button
              type="button"
              onClick={handleOpenAdd}
              className="w-full py-3 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl font-bold text-xs text-gray-900 transition flex items-center justify-center gap-1.5 shadow"
            >
              <Plus className="w-4 h-4 text-sky-600" />
              프로필 추가
            </button>
          </div>
        ) : (
          /* 2. 프로필 추가 / 수정 입력 폼 */
          <div className="space-y-4 pt-1">
            {/* 표기 (프로필 제목) */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-gray-700">표기 (프로필 제목)</label>
                <span className="text-[10px] text-gray-500">{formLabel.length}/20</span>
              </div>
              <input
                maxLength={20}
                placeholder="예: 15살 레나, 제국의 기사"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* 이름 (호칭, 필수) */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-gray-700">
                  이름 <span className="text-sky-600">*</span>
                </label>
                <span className="text-[10px] text-gray-500">{formName.length}/20</span>
              </div>
              <p className="text-[11px] text-gray-500">작품 내에서 나를 어떻게 부를지 입력해 주세요</p>
              <input
                maxLength={20}
                required
                placeholder="나의 이름 / 호칭"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* 정보 (최대 1000자) */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-gray-700">정보</label>
                <span className="text-[10px] text-gray-500">{formInfo.length}/1000</span>
              </div>
              <p className="text-[11px] text-gray-500">작품 내에 반영될 나의 정보(나이, 성별, 외형, 성격 등)를 입력해 주세요</p>
              <textarea
                rows={5}
                maxLength={1000}
                placeholder="나이, 성별, 외형, 신체정보, 성격 등"
                value={formInfo}
                onChange={(e) => setFormInfo(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-900 focus:outline-none focus:border-sky-500 resize-none leading-relaxed"
              />
            </div>

            {/* 하단 취소 / 완료 버튼 */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMode('list')}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-xs text-gray-600 font-semibold transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-5 py-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:opacity-90 rounded-xl text-xs text-white font-bold transition shadow"
              >
                {mode === 'edit' ? '수정 완료' : '추가'}
              </button>
            </div>
          </div>
        )}

        </fieldset>
      </div>
    </div>
  );
}
