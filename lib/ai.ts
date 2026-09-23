import { compatibleUsage } from '@/lib/provider-usage';
import { memoryRecordSchema } from '@/lib/memory-records';
import { starsActive, type UsageContext } from '@/lib/stars';
import { recordClaudeUsage } from '@/lib/ai-usage';
import { visibleAnswer, visibleAnswerStream } from '@/lib/visible-answer';
import { recordChatCall } from '@/lib/chat-call-count';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { getAiSettings, getProviderKey } from '@/lib/settings';
import { COMPATIBLE_BASE_URLS, PROVIDER_NAMES, supportsTemperature, type AiProvider } from '@/lib/ai-config';

export type AiMessage = { role: 'user' | 'assistant'; content: string };
export class AiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

// SDK errors/headers may contain secrets or prompts. Return only safe messages.
export function describeAiError(error: unknown, provider?: AiProvider) {
  if (error instanceof AiError) return { error: error.message, status: error.status };
  const err = error as { status?: number; code?: string; error?: { code?: string; type?: string } };
  const status = Number(err?.status) || 502;
  const code = err?.code || err?.error?.code || err?.error?.type;
  const label = provider ? PROVIDER_NAMES[provider] : 'AI';
  let message = '응답을 받지 못했습니다. NAS 인터넷 연결과 제공업체 상태를 확인해 주세요.';
  if (status === 401) message = 'API 키 인증에 실패했습니다. 해당 제공업체에서 발급한 유효한 키인지 확인해 주세요.';
  else if (status === 403) message = '이 키 또는 계정에 모델 사용 권한이 없습니다.';
  else if (code === 'insufficient_quota' || code === 'credit_balance_too_low') message = 'API 잔액 또는 사용 한도가 부족합니다. API 결제·한도를 확인해 주세요.';
  else if (status === 429) message = 'API 요청 한도 또는 사용량 한도에 도달했습니다. 잠시 후 재시도하고 결제·한도를 확인해 주세요.';
  else if (status === 404) message = '모델을 찾을 수 없거나 계정에 접근 권한이 없습니다. 모델 ID를 확인해 주세요.';
  else if (status === 400) message = 'API가 요청을 거절했습니다. 모델 설정, 대화 길이, API 잔액을 확인해 주세요.';
  else if (status === 529 || status === 503) message = '제공업체가 혼잡합니다. 잠시 후 다시 시도해 주세요.';
  return { error: `${label}: ${message} (HTTP ${status})`, status: status >= 400 && status <= 599 ? status : 502 };
}

export function resolveAi(summary = false) {
  const settings = getAiSettings();
  const provider = summary && settings.summaryProvider !== 'same' ? settings.summaryProvider : settings.provider;
  const apiKey = getProviderKey(settings, provider);
  if (!apiKey) throw new AiError(`${PROVIDER_NAMES[provider]} API 키가 없습니다. 설정에서 해당 키를 저장해 주세요.`);
  if (provider === 'anthropic' && !apiKey.startsWith('sk-ant-')) throw new AiError('Claude에는 Anthropic 키가 필요합니다. GPT 키를 쓰려면 설정에서 GPT를 선택하세요.');
  if (provider === 'openai' && apiKey.startsWith('sk-ant-')) throw new AiError('GPT에는 OpenAI 키가 필요합니다.');
  return { provider, apiKey, model: summary && settings.summaryProvider !== 'same' && settings.summaryModel !== 'same' ? settings.summaryModel : settings.models[provider], maxTokens: settings.maxTokens, temperature: settings.temperature };
}

export async function openAiTextStream(system: string, messages: AiMessage[], signal?: AbortSignal, maxTokens?: number, acceptOutputLimit = false, chatSessionId?: string, cachePrefix?: string, billing?: UsageContext, memoryCache?: string, editableCache?: string) {
  messages = messages.map(message => message.role === 'assistant' ? { ...message, content: visibleAnswer(message.content) } : message).filter(message => message.role !== 'assistant' || message.content.trim());
  if (chatSessionId) system += '\n\n[답변 출력 형식]\n첫 줄부터 실제 장면·대사 또는 지정된 이미지·상태창으로 시작하세요. 최종 이야기만 출력하고, 사용자 입력의 의도 분석·응답 계획·규칙 점검·작성 이유는 언어와 태그 유무에 관계없이 출력하지 마세요. <thinking> 또는 <think> 블록도 포함하지 마세요.';
  const config = resolveAi(billing?.kind === '요약');
  if (billing?.inputBreakdown) {
    const chars = (text: string) => Array.from(text).length;
    const prior = messages.slice(0, -1);
    const b = billing.inputBreakdown;
    billing = { ...billing, inputBreakdown: {
      ...b,
      historyChars: prior.reduce((sum, message) => sum + chars(message.content), 0),
      historyMessages: prior.length,
      historyTurns: prior.filter(message => message.role === 'user').length,
      requestChars: chars(messages.at(-1)?.content || ''),
      otherChars: Math.max(0, chars(system) - b.cachedChars - b.keywordChars - b.memoryChars),
      totalChars: chars(system) + messages.reduce((sum, message) => sum + chars(message.content), 0),
    } };
  }
  const sampling = supportsTemperature(config.provider, config.model) ? { temperature: config.temperature } : {};
  const max = maxTokens ?? config.maxTokens;
  const tracking = starsActive();
  const requestedAt = new Date().toISOString();
  const record = (usage: ReturnType<typeof compatibleUsage>, completed: boolean) => recordClaudeUsage(chatSessionId || billing?.sessionId, config.model, usage || { input: 0, output: 0, write: 0, read: 0 }, completed, {
    ...billing, sessionId: chatSessionId || billing?.sessionId, kind: billing?.kind || (chatSessionId ? '채팅' : '기타 생성'), tracking, provider: config.provider, usageMissing: !usage, requestedAt,
  });
  // Gemini/DeepSeek use their official OpenAI-compatible Chat Completions APIs.
  // Older OpenAI chat-only models can also be selected from account discovery.
  if (config.provider === 'gemini' || config.provider === 'deepseek' || (config.provider === 'openai' && /^(?:gpt-3\.5|gpt-4(?:-|$)|chat-latest|.*chat-latest|o1-mini|o1-preview)/.test(config.model))) {
    const client = new OpenAI({ apiKey: config.apiKey, baseURL: COMPATIBLE_BASE_URLS[config.provider], maxRetries: 0, timeout: 120_000 });
    signal?.throwIfAborted();
    if (chatSessionId) recordChatCall(chatSessionId);
    const stream = await client.chat.completions.create({
      model: config.model, messages: [{ role: 'system', content: system }, ...messages],
      ...(config.provider === 'openai' && !/^gpt-(?:3\.5|4(?:-|$))/.test(config.model) ? { max_completion_tokens: max } : { max_tokens: max }),
      stream: true, stream_options: { include_usage: true }, ...sampling,
      ...(billing?.kind === '요약' ? { response_format: { type: 'json_object' as const } } : {}),
    }, { signal });
    return { provider: config.provider, abort: () => stream.controller.abort(), text: visibleAnswerStream((async function* () {
      let finish: string | null = null;
      let completed = false;
      let usage: ReturnType<typeof compatibleUsage> = null;
      try {
        for await (const event of stream) {
          if (event.usage) usage = compatibleUsage(event.usage);
          const choice = event.choices?.[0];
          if (choice?.finish_reason) finish = choice.finish_reason;
          // Never render reasoning_content, thinking or other private reasoning fields.
          if (typeof choice?.delta?.content === 'string') yield choice.delta.content;
        }
        completed = finish !== null;
        if (finish !== 'stop' && !(finish === 'length' && acceptOutputLimit && billing?.kind !== '요약')) throw new AiError(finish === 'length' ? '출력 한도에 도달하여 응답이 완료되지 않았습니다. 요약 원문과 기존 기억은 보존됩니다.' : 'AI 응답이 정상적으로 완료되지 않았습니다. 다시 시도해 주세요.', 502);
      } finally { record(usage, completed); }
    })()) };
  }
  if (config.provider === 'openai') {
    const client = new OpenAI({ apiKey: config.apiKey, baseURL: 'https://api.openai.com/v1', maxRetries: 0, timeout: 120_000 });
    signal?.throwIfAborted();
    if (chatSessionId) recordChatCall(chatSessionId);
    // o1-pro has no streaming support; return its completed text through the same UI stream.
    if (/^o1-pro(?:-|$)/.test(config.model)) {
      const response = await client.responses.create({ model: config.model, instructions: system, input: messages, max_output_tokens: max, store: false }, { signal });
      record(compatibleUsage(response.usage, true), response.status === 'completed');
      if (response.status !== 'completed' && !(acceptOutputLimit && billing?.kind !== '요약' && response.status === 'incomplete' && response.incomplete_details?.reason === 'max_output_tokens')) throw new AiError('GPT 응답 생성이 완료되지 않았습니다. 다시 시도해 주세요.', 502);
      return { provider: config.provider, abort: () => {}, text: visibleAnswerStream((async function* () { if (response.output_text) yield response.output_text; })()) };
    }
    const stream = await client.responses.create({
      model: config.model, instructions: system, input: messages,
      max_output_tokens: max, store: false, stream: true, ...sampling,
    }, { signal });
    return {
      provider: config.provider,
      abort: () => stream.controller.abort(),
      text: visibleAnswerStream((async function* () {
        let completed = false;
        let usage: ReturnType<typeof compatibleUsage> = null;
        try {
          for await (const event of stream) {
            if ('response' in event && event.response?.usage) usage = compatibleUsage(event.response.usage, true);
            if (event.type === 'response.output_text.delta' || event.type === 'response.refusal.delta') yield event.delta;
            else if (event.type === 'error' || event.type === 'response.failed') throw new AiError('GPT 응답 생성이 중단됐습니다. 잠시 후 다시 시도해 주세요.', 502);
            else if (event.type === 'response.incomplete') {
              if (acceptOutputLimit && billing?.kind !== '요약' && event.response.incomplete_details?.reason === 'max_output_tokens') completed = true;
              else throw new AiError('GPT 응답 생성이 완료되지 않았습니다. 다시 시도해 주세요.', 502);
            } else if (event.type === 'response.completed') completed = true;
          }
          if (!completed) throw new AiError('GPT 연결이 응답 완료 전에 끊겼습니다.', 502);
        } finally { record(usage, completed); }
      })()),
    };
  }
  const summaryFormat = billing?.kind === '요약' && /^claude-(?:(?:opus|sonnet)-4-[56]|haiku-4-5)(?:-|$)/.test(config.model)
    ? { format: { type: 'json_schema' as const, schema: {
      type: 'object', additionalProperties: false,
      properties: {
        title: { type: 'string', description: '짧은 사건 제목' },
        summary: { type: 'string', description: billing?.memoryFormat === 'records' ? '사건 색인, 권장 500자. 사실 상세는 records에만 기록' : '핵심 사건과 현재 상태. 권장 1200자, 최대 1800자.' },
        relations: { type: 'string', description: billing?.memoryFormat === 'records' ? '빈 문자열. 관계는 records에 기록' : '인물 관계와 변화. 권장 300자, 최대 600자.' },
        goals: { type: 'string', description: billing?.memoryFormat === 'records' ? '빈 문자열. 약속은 records에 기록' : '약속과 미해결 목표. 권장 300자, 최대 600자.' },
        ...(billing?.memoryFormat === 'records' ? { records: { type: 'array', items: memoryRecordSchema }, scene: { type: 'string', description: '구간 끝 현재 장면과 답변 대기 사항' } } : {}),
      }, required: ['title', 'summary', 'relations', 'goals', ...(billing?.memoryFormat === 'records' ? ['records','scene'] : [])],
    } } } : undefined;
  // Snapshot the TTL before requesting: settings may change while streaming.
  const cacheTtl = getAiSettings().cacheTtl;
  const cacheEnabled = Boolean(chatSessionId && cachePrefix && system.startsWith(cachePrefix));
  const cachedMemory = cacheEnabled && memoryCache && system.startsWith(cachePrefix! + memoryCache) ? memoryCache : '';
  const cachedEditable = cacheEnabled && editableCache && system.startsWith(cachePrefix! + cachedMemory + editableCache) ? editableCache : '';
  const client = new Anthropic({ apiKey: config.apiKey, baseURL: 'https://api.anthropic.com', maxRetries: 0, timeout: 120_000 });
  signal?.throwIfAborted();
  if (chatSessionId) recordChatCall(chatSessionId);
  const stream = await client.messages.create({
    model: config.model,
    system: chatSessionId && cachePrefix && system.startsWith(cachePrefix)
      ? [
          { type: 'text' as const, text: cachePrefix, cache_control: { type: 'ephemeral' as const, ttl: cacheTtl } },
          ...(cachedMemory ? [{ type: 'text' as const, text: cachedMemory, cache_control: { type: 'ephemeral' as const, ttl: cacheTtl } }] : []),
          ...(cachedEditable ? [{ type: 'text' as const, text: cachedEditable, cache_control: { type: 'ephemeral' as const, ttl: cacheTtl } }] : []),
          ...(system.slice(cachePrefix.length + cachedMemory.length + cachedEditable.length) ? [{ type: 'text' as const, text: system.slice(cachePrefix.length + cachedMemory.length + cachedEditable.length) }] : []),
        ]
      : system,
    messages, max_tokens: max, stream: true, ...sampling,
    ...(summaryFormat ? { output_config: summaryFormat } : {}),
  }, { signal });
  return {
    provider: config.provider,
    abort: () => stream.controller.abort(),
    text: visibleAnswerStream((async function* () {
      let completed = false;
      let stopReason: string | null = null;
      let hasUsage = false;
      const usage = { input: 0, output: 0, write: 0, read: 0 };
      try {
        for await (const event of stream) {
          if (event.type === 'message_start') {
            hasUsage = true;
            usage.input = event.message.usage.input_tokens;
            usage.output = event.message.usage.output_tokens;
            usage.write = event.message.usage.cache_creation_input_tokens ?? 0;
            usage.read = event.message.usage.cache_read_input_tokens ?? 0;
          } else if (event.type === 'message_delta') {
            if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
            hasUsage = true;
            usage.output = event.usage.output_tokens;
            if (typeof event.usage.input_tokens === 'number') usage.input = event.usage.input_tokens;
            if (typeof event.usage.cache_creation_input_tokens === 'number') usage.write = event.usage.cache_creation_input_tokens;
            if (typeof event.usage.cache_read_input_tokens === 'number') usage.read = event.usage.cache_read_input_tokens;
          } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield event.delta.text;
          else if (event.type === 'message_stop') completed = true;
        }
        if (!completed) throw new AiError('Claude 연결이 응답 완료 전에 끊겼습니다.', 502);
        if (billing?.kind === '요약' && stopReason === 'max_tokens') {
          throw new AiError('요약이 출력 토큰 한도에 도달하여 완료되지 않았습니다. 기존 기억과 미요약 원문은 보존됩니다.', 502);
        }
        if (billing?.kind === '요약' && stopReason === 'refusal') {
          throw new AiError('모델이 요약 요청에 응답하지 않았습니다. 기존 기억과 미요약 원문은 보존됩니다.', 502);
        }
      } finally {
        if (hasUsage) recordClaudeUsage(chatSessionId || billing?.sessionId, config.model, usage, completed, { ...billing, sessionId: chatSessionId || billing?.sessionId, kind: billing?.kind || (chatSessionId ? '채팅' : '기타 생성'), tracking, cacheTtl: cacheEnabled ? cacheTtl : '5m' });
      }
    })()),
  };
}

export async function generateAiText(system: string, messages: AiMessage[], maxTokens: number, signal?: AbortSignal, billing?: UsageContext) {
  const result = await openAiTextStream(system, messages, signal, maxTokens, false, undefined, undefined, billing);
  try {
    let text = '';
    for await (const delta of result.text) text += delta;
    if (!text.trim()) throw new AiError('AI가 비어 있는 응답을 반환했습니다.', 502);
    return text;
  } finally { result.abort(); }
}
