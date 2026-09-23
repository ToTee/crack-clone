export type GlobalPromptSections = {
  required: string;
  general: string;
  output: string;
  other: string;
};

export const GLOBAL_PROMPT_FIELDS = [
  { key: 'required', label: '필수', description: '반드시 지켜야 할 원칙과 금지 사항을 입력해 주세요.' },
  { key: 'general', label: '일반', description: '대화와 이야기 진행에 공통으로 적용할 내용을 입력해 주세요.' },
  { key: 'output', label: '문체·형식', description: '문체, 묘사, 출력 분량, 이미지와 상태창 규칙을 입력해 주세요.' },
  { key: 'other', label: '기타', description: '그 밖에 공통으로 적용할 내용을 입력해 주세요.' },
] as const;

export function emptyGlobalPromptSections(): GlobalPromptSections {
  return { required: '', general: '', output: '', other: '' };
}

export function isGlobalPromptSections(value: unknown): value is GlobalPromptSections {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const fields = value as Record<string, unknown>;
  return Object.keys(fields).length === GLOBAL_PROMPT_FIELDS.length
    && GLOBAL_PROMPT_FIELDS.every(({ key }) => Object.hasOwn(fields, key) && typeof fields[key] === 'string');
}

// Preserve the old prompt byte-for-byte when it is merely opened or saved in General.
// Empty sections add neither headings nor instructions to the model request.
export function combineGlobalPromptSections(sections: GlobalPromptSections): string {
  const active = GLOBAL_PROMPT_FIELDS.filter(({ key }) => sections[key].trim());
  if (active.length === 1 && active[0].key === 'general') return sections.general;
  return active.map(({ key, label }) => `[${label}]\n${sections[key]}`).join('\n\n');
}
