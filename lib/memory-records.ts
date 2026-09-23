// Structured memories retain their source range. Retrieval is local and never calls an AI.
export type RecordKind = 'facts' | 'relations' | 'goals';
export type MemoryRecord = { kind: RecordKind; subject: string; key: string; content: string; people: string[]; state: 'active' | 'resolved' };
export const memoryRecordSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['facts', 'relations', 'goals'] },
    subject: { type: 'string', description: '사실/약속의 주체 또는 관계를 보는 인물의 정확한 이름' },
    key: { type: 'string', description: '같은 사실/관계/약속을 식별하는 짧고 일관된 항목명' },
    content: { type: 'string', description: '변경된 현재 사실. 확정/추측과 누가 알고 있는지 구분' },
    people: { type: 'array', items: { type: 'string' } },
    state: { type: 'string', enum: ['active', 'resolved'] },
  }, required: ['kind', 'subject', 'key', 'content', 'people', 'state'],
};
export function parseMemoryRecords(value: unknown): MemoryRecord[] {
  if (!Array.isArray(value) || value.length > 60) throw new Error('기억 항목 형식이 올바르지 않습니다.');
  const seen = new Set<string>();
  return value.map((r: any) => {
    if (!r || !['facts','relations','goals'].includes(r.kind) || !['active','resolved'].includes(r.state)
      || !['subject','key','content'].every(k => typeof r[k] === 'string' && r[k].trim())
      || r.subject.length > 120 || r.key.length > 120 || r.content.length > 1200
      || !Array.isArray(r.people) || r.people.length > 30 || r.people.some((p: unknown) => typeof p !== 'string' || !p.trim() || p.length > 120)) throw new Error('기억 항목 형식이 올바르지 않습니다.');
    const record = { ...r, subject: r.subject.trim(), key: r.key.trim(), content: r.content.trim(), people: [...new Set<string>(r.people.map((p: string) => p.trim()))] } as MemoryRecord;
    const key = JSON.stringify([record.kind, record.subject, record.key]);
    if (seen.has(key)) throw new Error('같은 기억 항목이 중복되었습니다.');
    seen.add(key); return record;
  });
}
export type MemoryRow = { id: number; kind: string; title: string; content: string; start_turn: number; end_turn: number; manual: number; hidden?: number; subject?: string; record_key?: string; people?: string; state?: string; format_version?: number };
export function latestRecords<T extends MemoryRow>(rows: T[]) {
  const result = new Map<string, T>();
  for (const row of [...rows].sort((a,b)=>a.end_turn-b.end_turn || a.id-b.id)) {
    if (!row.record_key) continue;
    result.set(JSON.stringify([row.kind,row.subject,row.record_key]),row);
  }
  // Hidden/resolved updates still supersede older versions; never resurrect old facts.
  return [...result.values()].filter(r=>!r.hidden);
}
export function mentionsMemoryName(text: string, name: string) {
  if(!name)return false;
  const particles = new Set(['','은','는','이','가','을','를','의','도','만','와','과','랑','이랑','에게','한테','께','에게는','에게도','에게서','한테는','한테도','에서','에','로','으로','부터','까지','처럼','보다','아','야','이라고','라고','이라는','라는']);
  for(let at=text.indexOf(name);at>=0;at=text.indexOf(name,at+1)) {
    if(/[\p{L}\p{M}\p{N}_]$/u.test(text.slice(0,at)))continue;
    const tail=text.slice(at+name.length).match(/^[\p{L}\p{M}\p{N}_]*/u)![0];
    if(particles.has(tail))return true;
  }
  return false;
}
export function memoryTerms(text: string) {
  return [...new Set((text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])
    .map(t=>t.replace(/(?:에게는|에게|에서는|에서|으로|이랑|하고|은|는|을|를|이|가|의)$/u,''))
    .filter(t=>t.length>=2 && !['이어서','진행','그냥','그리고','상태창','사용자'].includes(t)))];
}
export function memoryScore(row: MemoryRow, query: string, terms: string[]) {
  const hay = `${row.title} ${row.subject || ''} ${row.people || ''} ${row.content}`.toLowerCase();
  let score = terms.reduce((n,t)=>n+(hay.includes(t)?1:0),0);
  for(const name of [row.subject, ...safePeople(row.people)]) if(name && mentionsMemoryName(query,name)) score += 4;
  return score;
}
export function safePeople(value?: string): string[] { try { const v=JSON.parse(value || '[]'); return Array.isArray(v)?v.filter(p=>typeof p==='string'):[]; } catch { return []; } }
export function relationGroups<T extends MemoryRow>(rows: T[], knownNames: string[] = []) {
  const groups = new Map<string, T[]>();
  for (const row of rows.filter(r=>r.kind==='relations' && !r.hidden)) {
    // Legacy free text remains intact. Only explicit name headings are grouped.
    const heading = !row.subject && row.content.match(/^\s*(?:\*\*)?([가-힣A-Za-z][가-힣A-Za-z ·]{0,35})(?:\*\*)?\s*[:：]/u)?.[1]?.trim();
    const names = row.subject ? [row.subject] : heading && knownNames.includes(heading) ? [heading] : knownNames.filter(name=>mentionsMemoryName(row.content,name));
    if (!names.length) names.push(row.manual && !/턴|요약|관계 변화/.test(row.title) ? row.title : '기존 관계 기록 · 이름 미분류');
    for (const name of new Set(names)) { if(!groups.has(name))groups.set(name,[]);groups.get(name)!.push(row); }
  }
  return [...groups].map(([name,items])=>({name,items:items.sort((a,b)=>b.end_turn-a.end_turn || b.id-a.id)}));
}
