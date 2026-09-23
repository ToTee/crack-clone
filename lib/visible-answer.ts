// Shared by streaming responses and legacy assistant rendering. Never imports server code.
// Callers must leave user messages untouched. This is not a general English-language filter.
// Reasoning delimiters are reserved in assistant output, including inside code blocks.
const delimiters = ['<thinking>', '</thinking>', '<think>', '</think>'];
const tokens = [...delimiters, ...delimiters.map(tag => `\\${tag}`)];

function createDelimiterFilter() {
  let pending = '';
  let depth = 0;
  return {
    push(chunk: string) {
      let visible = '';
      for (const char of chunk) {
        pending += char;
        while (pending) {
          const lower = pending.toLowerCase();
          if (tokens.includes(lower)) {
            if (lower.includes('</')) depth = Math.max(0, depth - 1);
            else depth++;
            pending = '';
            break;
          }
          if (tokens.some(tag => tag.startsWith(lower))) break;
          if (!depth) visible += pending[0];
          pending = pending.slice(1);
        }
      }
      return visible;
    },
    finish() {
      // Drop truncated delimiters and unclosed reasoning rather than exposing them.
      const visible = !depth && !/^\\?<\/?t/i.test(pending) ? pending : '';
      pending = '';
      return visible;
    },
  };
}

const prefixStarts = ['the user ', 'i think the user ', 'i should ', 'i need to ', 'i must ', 'let me '];
const maxPrefix = 384;
const maxBoundaryLine = 2048;

function isPlanningPrefix(text: string) {
  const value = text.trimStart();
  // Deliberately narrow, assistant-addressed wording. Ordinary English prose, quotes,
  // dialogue and fenced code must not be removed merely for being in English.
  return /^the user (?:is (?:again )?(?:giving|providing)|has (?:again )?provided) (?:an? )?(?:vague|ambiguous|brief|short|generic) (?:action|input|instruction|prompt|request|message)\b/i.test(value)
    || /^(?:i think )?the user (?:wants|expects) me to\b/i.test(value)
    || (/^the user\b/i.test(value) && /\b(?:i think the user|i should (?:respond|write)|i need to (?:respond|write)|wants me to)\b/i.test(value))
    || /^i (?:should|need to|must) have [^\r\n.!?]{1,70}\breact naturally\b/i.test(value)
    || /^i (?:should|need to|must) (?:respond to the user|continue the (?:roleplay|scene)|avoid (?:fabricating|inventing) (?:the user's|the user’s|PC's|PC’s))\b/i.test(value)
    || /^let me (?:think through (?:the user's|the user’s|this request)|analy[sz]e (?:the user's|the user’s|this prompt))\b/i.test(value);
}

function isStoryBoundary(line: string, complete: boolean) {
  const value = line.trimStart();
  if (/^(?:\{\{(?:media:|img:)|!\[|\[(?:상황 이미지|이미지)\]\(|```|~~~)/i.test(value)) return true;
  if (/^\*\*[^*\r\n]{1,80}\*\*\s*\|/.test(value)) return true;
  // A single italic narrative marker, not a Markdown bullet or bold planning heading.
  if (/^\*(?!\*)[^\s*]/.test(value)) return true;
  // Unmarked Korean narration is accepted only as a complete prose line. Quoted
  // Korean user input inside an English planning paragraph is not a boundary.
  return complete && /^[가-힣]/.test(value) && /[다요죠까][.!?…。]["”’']?\s*$/.test(value)
    && !/(?:사용자|프롬프트|답변|응답|서술|작성|추론|분석|계획|사칭|조종)/.test(value);
}

function createLeadingPlanningFilter() {
  let mode: 'probe' | 'hidden' | 'visible' = 'probe';
  let pending = '';
  let skipLine = false;
  return {
    push(chunk: string) {
      if (mode === 'visible') return chunk;
      for (let i = 0; i < chunk.length; i++) {
        const char = chunk[i];
        if (mode === 'probe') {
          pending += char;
          const probe = pending.trimStart().toLowerCase();
          if (isPlanningPrefix(pending)) {
            mode = 'hidden';
            pending = '';
            // The rest of the detected paragraph cannot be a body boundary. In
            // particular, embedded Korean input or inline asterisks stay hidden.
            skipLine = true;
          } else if (pending.length >= maxPrefix || (probe && (!prefixStarts.some(start => start.startsWith(probe) || probe.startsWith(start)) || /[\r\n]/.test(probe)))) {
            mode = 'visible';
            const result = pending + chunk.slice(i + 1);
            pending = '';
            return result;
          }
          continue;
        }
        if (skipLine) {
          if (char === '\n') skipLine = false;
          continue;
        }
        pending += char;
        if (isStoryBoundary(pending, char === '\n')) {
          mode = 'visible';
          const result = pending + chunk.slice(i + 1);
          pending = '';
          return result;
        }
        if (char === '\n') pending = '';
        else if (pending.length >= maxBoundaryLine) {
          pending = '';
          skipLine = true;
        }
      }
      return '';
    },
    finish() {
      // Once planning is detected, never reveal an unfinished planning paragraph.
      const result = mode === 'probe' || (mode === 'hidden' && !skipLine && isStoryBoundary(pending, true)) ? pending : '';
      pending = '';
      mode = 'visible';
      return result;
    },
  };
}

export function createVisibleAnswerFilter() {
  const delimiters = createDelimiterFilter();
  const leading = createLeadingPlanningFilter();
  return {
    push(chunk: string) { return leading.push(delimiters.push(chunk)); },
    finish() { return leading.push(delimiters.finish()) + leading.finish(); },
  };
}

export function visibleAnswer(text: string) {
  const filter = createVisibleAnswerFilter();
  return filter.push(text) + filter.finish();
}

export async function* visibleAnswerStream(source: AsyncIterable<string>) {
  const filter = createVisibleAnswerFilter();
  for await (const chunk of source) {
    const text = filter.push(chunk);
    if (text) yield text;
  }
  const tail = filter.finish();
  if (tail) yield tail;
}
