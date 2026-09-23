export const AI_PROVIDERS = ['anthropic', 'openai', 'gemini', 'deepseek'] as const;
export type AiProvider = typeof AI_PROVIDERS[number];
export const isAiProvider = (value: unknown): value is AiProvider => AI_PROVIDERS.includes(value as AiProvider);
export const PROVIDER_NAMES: Record<AiProvider, string> = { anthropic: 'Claude (Anthropic)', openai: 'GPT (OpenAI)', gemini: 'Gemini (Google)', deepseek: 'DeepSeek' };
export const DEFAULT_MODELS: Record<AiProvider, string> = { anthropic: 'claude-opus-4-6', openai: 'gpt-4.1', gemini: 'gemini-3.8-flash', deepseek: 'deepseek-flash' };
export const COMPATIBLE_BASE_URLS = { openai: 'https://api.openai.com/v1', gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/', deepseek: 'https://api.deepseek.com' };
export type ModelOption = { id: string; label: string };
const options = (rows: string[][]): ModelOption[] => rows.map(([id, label]) => ({ id, label }));
// Official text-model catalogs checked 2026-09-21. Account discovery supplements this list.
export const MODEL_OPTIONS: Record<AiProvider, ModelOption[]> = {
  anthropic: options([
    ['claude-haiku-4-5-20251001', 'Claude Haiku 4.5 · 경량'],
    ['claude-sonnet-5', 'Claude Sonnet 5 · 균형'],
    ['claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5'],
    ['claude-sonnet-4-6', 'Claude Sonnet 4.6'],
    ['claude-opus-4-5-20251101', 'Claude Opus 4.5'],
    ['claude-opus-4-6', 'Claude Opus 4.6'],
    ['claude-opus-4-7', 'Claude Opus 4.7'],
    ['claude-opus-4-8', 'Claude Opus 4.8'],
    ['claude-opus-5', 'Claude Opus 5 · 고성능'],
    ['claude-fable-5', 'Claude Fable 5'],
    ['claude-fable-5-1', 'Claude Fable 5.1 · 최상위'],
    ['claude-mythos-5', 'Claude Mythos 5 · 제한된 계정'],
    ['claude-mythos-5-1', 'Claude Mythos 5.1 · 제한된 계정'],
  ]),
  openai: options([
    ['gpt-5-nano', 'GPT-5 nano · 초경량 / 기존'],
    ['gpt-4.1-nano', 'GPT-4.1 nano · 초경량 / 기존'],
    ['gpt-4o-mini', 'GPT-4o mini · 경량 / 기존'],
    ['gpt-5.4-nano', 'GPT-5.4 nano · 경량'],
    ['gpt-5.6-luna', 'GPT-5.6 Luna · 경량'],
    ['gpt-5-mini', 'GPT-5 mini · 경량 / 기존'],
    ['gpt-4.1-mini', 'GPT-4.1 mini · 기존'],
    ['gpt-5.4-mini', 'GPT-5.4 mini · 균형'],
    ['o3-mini', 'o3-mini · 추론 / 기존'],
    ['o4-mini', 'o4-mini · 추론 / 기존'],
    ['gpt-5', 'GPT-5 · 기존'],
    ['gpt-5.1', 'GPT-5.1 · 기존'],
    ['gpt-5.2', 'GPT-5.2 · 기존'],
    ['gpt-4.1', 'GPT-4.1 · 기존'],
    ['gpt-5.6-terra', 'GPT-5.6 Terra · 균형'],
    ['o3', 'o3 · 추론 / 기존'],
    ['gpt-4o', 'GPT-4o · 기존'],
    ['gpt-5.4', 'GPT-5.4 · 기존'],
    ['gpt-5.6-sol', 'GPT-5.6 Sol · 고성능'],
    ['gpt-5.5', 'GPT-5.5 · 기존'],
    ['gpt-6-astra', 'GPT-6 Astra · 최상위'],
    ['o1', 'o1 · 추론 / 기존'],
    ['gpt-5-pro', 'GPT-5 Pro · 고성능 추론 / 기존'],
    ['o3-pro', 'o3-pro · 고성능 추론 / 기존'],
    ['gpt-5.2-pro', 'GPT-5.2 Pro · 고성능 추론 / 기존'],
    ['gpt-5.4-pro', 'GPT-5.4 Pro · 고성능 추론 / 기존'],
    ['gpt-5.5-pro', 'GPT-5.5 Pro · 고성능 추론'],
    ['o1-pro', 'o1-pro · 고비용 추론 / 기존'],
  ]),
  gemini: options([
    ['gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite · 초경량'],
    ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite · 경량'],
    ['gemini-3-flash-preview', 'Gemini 3 Flash · 기존 미리보기'],
    ['gemini-3.6-flash', 'Gemini 3.6 Flash'],
    ['gemini-3.7-flash', 'Gemini 3.7 Flash'],
    ['gemini-3.8-flash', 'Gemini 3.8 Flash · 균형'],
    ['gemini-3.5-flash', 'Gemini 3.5 Flash'],
    ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro · 고성능 / 미리보기'],
    ['gemini-3.1-pro-preview-customtools', 'Gemini 3.1 Pro Custom Tools · 미리보기'],
  ]),
  deepseek: options([
    ['deepseek-flash', 'DeepSeek Flash · 경량'],
    ['deepseek-v4-pro', 'DeepSeek V4 Pro · 고성능'],
  ]),
};
export function validModelId(provider: AiProvider, model: unknown): model is string {
  if (typeof model !== 'string' || model.length > 160) return false;
  const patterns = { anthropic: /^claude-[\w.:-]+$/, openai: /^(?:gpt-|o[1-9]|chat-latest)[\w.:-]*$/, gemini: /^gemini-[\w.:-]+$/, deepseek: /^deepseek-[\w.:-]+$/ };
  return patterns[provider].test(model);
}
export function isTextModel(provider: AiProvider, id: string) {
  return validModelId(provider, id) && !/(?:image|audio|realtime|live|tts|transcrib|embedding|robotics|omni|computer-use|deep-research|search|codex|cyber|rosalind)/i.test(id);
}
export function supportsTemperature(provider: AiProvider, model: string) {
  return provider === 'anthropic' ? /^claude-(?:opus-4-[56]|sonnet-4|haiku-4)/.test(model)
    : provider === 'openai' ? /^gpt-4\.1(?:-|$)/.test(model) : false;
}
