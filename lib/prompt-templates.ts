export const PROMPT_TEMPLATES = [
  { id: 'default', title: '기본 프롬프트', icon: '✨', desc: '설정과 대화 맥락에 맞춰 유연하게 답해요', instruction: '제작자가 입력한 프롬프트의 역할, 세계관, 말투와 출력 형식을 따른다. 대화 맥락에 맞는 자연스러운 한국어로 답한다. 불필요한 반복과 과장된 비유를 피하고, 분량은 상황과 제작자의 지시에 맞춘다.' },
  { id: 'rp', title: '1:1 롤플레잉 프롬프트', icon: '😀', desc: '캐릭터의 성격과 관계를 유지하며 대화해요', instruction: '지정된 캐릭터로서 사용자와 일대일 대화를 이어간다. 캐릭터의 성격, 호칭, 말투, 관계와 이전 사건을 일관되게 유지한다. 대사는 자연스러운 한국어 구어체로 쓰고 행동 묘사는 필요한 만큼만 덧붙인다. 사용자의 대사, 행동, 선택과 속마음을 대신 결정하지 않는다. 제작자가 지정한 서식을 따른다.' },
  { id: 'simulation', title: '시뮬레이션 프롬프트', icon: '🎮', desc: '세계와 여러 인물의 행동·결과를 진행해요', instruction: '세계와 여러 등장인물의 진행자 역할을 맡는다. 설정된 규칙, 시간, 장소, 인물 관계와 상태 변화를 일관되게 추적한다. 사용자 선택에 따른 결과와 인물들의 반응을 인과관계에 맞게 서술한다. 사용자의 행동과 선택은 대신 확정하지 않는다. 상태 표시와 대사 형식은 제작자의 프롬프트를 따르며, 정해지지 않은 수치나 규칙을 이미 확정된 설정인 것처럼 제시하지 않는다.' },
  { id: 'productivity', title: '생산성 프롬프트', icon: '📑', desc: '목적에 맞춰 명확하고 실용적인 답을 해요', instruction: '사용자의 작업 목적과 제작자의 지시에 맞춰 명확하고 실용적인 답변을 제공한다. 핵심부터 설명하고 필요한 경우 단계, 목록과 예시를 사용한다. 사실과 추정을 구분하고 불확실한 내용은 밝힌다. 요청하지 않은 역할극, 상태바, 소설식 묘사는 덧붙이지 않는다.' },
  { id: 'custom', title: '제작자 커스텀 프롬프트', icon: '📝', desc: '자동 템플릿 지침 없이 직접 입력한 지시를 사용해요', instruction: '' },
  { id: 'derivative', title: '2차 창작 기반', icon: '🚀', desc: '제공한 원작 설정과 인물에 맞춰 이야기를 이어가요', instruction: '제작자가 제공한 원작의 세계관, 인물 성격, 관계, 시대와 말투를 바탕으로 새로운 이야기를 이어간다. 원작 설정과 제작자가 지정한 변경 설정을 구분하고, 변경 설정이 명시되면 그것을 따른다. 제공되지 않은 원작 정보를 확정된 사실로 단정하지 않는다. 사용자의 대사와 선택은 대신 결정하지 않으며, 출력 형식과 분량은 제작자의 프롬프트를 따른다.' },
] as const;

export function getPromptTemplate(value: string) {
  return PROMPT_TEMPLATES.find(t => t.id === value || t.title === value) || PROMPT_TEMPLATES[0];
}

export function parseEditorConfig(value: unknown): any | null {
  try {
    const config = typeof value === 'string' ? JSON.parse(value) : value;
    return config?.version === 1 && typeof config.prompt === 'string'
      && PROMPT_TEMPLATES.some(t => t.id === config.template) ? config : null;
  } catch { return null; }
}

export function characterInstructions(character: { system_prompt: string; editor_config?: string | null }) {
  const config = parseEditorConfig(character.editor_config);
  if (!config) return character.system_prompt;
  const template = getPromptTemplate(config.template);
  return [template.instruction ? `[템플릿: ${template.title}]\n${template.instruction}\n구체적인 역할·말투·형식은 아래 제작자 프롬프트를 따른다.` : '', character.system_prompt].filter(Boolean).join('\n\n');
}

export function combineStoryPrompts(general: string, people = '', places = '') {
  return [
    `[일반 프롬프트]\n${general}`,
    people.trim() ? `[인물 프롬프트]\n${people}` : '',
    places.trim() ? `[장소 프롬프트]\n${places}` : '',
  ].filter(Boolean).join('\n\n');
}
