import db from '@/lib/db';
import { AiProvider, AI_PROVIDERS, DEFAULT_MODELS, isAiProvider } from '@/lib/ai-config';

export interface AiSettings {
  provider: AiProvider;
  anthropicApiKey: string;
  openaiApiKey: string;
  geminiApiKey: string;
  deepseekApiKey: string;
  summaryProvider: AiProvider | 'same';
  models: Record<AiProvider, string>;
  maxTokens: number;
  temperature: number;
  legacyOpenAIKey: boolean;
  summaryModel: string;
  recentTurns: number;
  summaryInterval: number;
  keywordExcludeStatus: boolean;
  cacheTtl: '5m' | '1h';
}
function numberOr(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
export function getAiSettings(): AiSettings {
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as Array<{ key: string; value: string }>;
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const oldKey = values.anthropic_api_key || '';
  // Only recognize explicit OpenAI project/service-account prefixes.
  const misplacedKey = /^sk-(?:proj|svcacct)-/.test(oldKey);
  const provider = isAiProvider(values.ai_provider) ? values.ai_provider : 'anthropic';
  return {
    summaryProvider: values.summary_provider === 'same' || isAiProvider(values.summary_provider) ? values.summary_provider : (provider === 'anthropic' && values.summary_model !== 'same' ? 'anthropic' : 'same'),
    geminiApiKey: values.gemini_api_key || '',
    deepseekApiKey: values.deepseek_api_key || '',
    keywordExcludeStatus: values.keyword_exclude_status !== 'false',
    summaryInterval: Number(values.summary_interval) === 10 ? 10 : 5,
    cacheTtl: values.cache_ttl === '5m' ? '5m' : '1h',
    summaryModel: values.summary_model || 'claude-sonnet-4-6',
    recentTurns: [2,4,6].includes(Number(values.recent_turns)) ? Number(values.recent_turns) : 2,
    provider,
    anthropicApiKey: misplacedKey ? '' : oldKey,
    openaiApiKey: values.openai_api_key || (misplacedKey ? oldKey : ''),
    models: {
      anthropic: values.anthropic_model || (values.selected_model?.startsWith('claude-') ? values.selected_model : DEFAULT_MODELS.anthropic),
      openai: values.openai_model || DEFAULT_MODELS.openai,
      gemini: values.gemini_model || DEFAULT_MODELS.gemini,
      deepseek: values.deepseek_model || DEFAULT_MODELS.deepseek,
    },
    maxTokens: Math.min(20000, Math.max(500, Math.round(numberOr(values.max_tokens, 3500)))),
    temperature: Math.min(1, Math.max(0, numberOr(values.temperature, 0.8))),
    legacyOpenAIKey: misplacedKey && !values.openai_api_key,
  };
}
export function getProviderKey(settings: AiSettings, provider = settings.provider) {
  return settings[`${provider}ApiKey`] || process.env[`${provider.toUpperCase()}_API_KEY`] || (provider === 'gemini' ? process.env.GOOGLE_API_KEY : '') || '';
}
export function publicAiSettings() {
  const settings = getAiSettings();
  const describe = (provider: AiProvider) => {
    const key = getProviderKey(settings, provider);
    return { hasApiKey: Boolean(key), maskedKey: key ? '••••' + key.slice(-4) : '' };
  };
  return {
    cacheTtl: settings.cacheTtl, provider: settings.provider, models: settings.models, summaryModel: settings.summaryModel, summaryProvider: settings.summaryProvider, recentTurns: settings.recentTurns, summaryInterval: settings.summaryInterval, keywordExcludeStatus: settings.keywordExcludeStatus,
    maxTokens: settings.maxTokens, temperature: settings.temperature,
    keys: Object.fromEntries(AI_PROVIDERS.map(p => [p, describe(p)])),
    legacyOpenAIKey: settings.legacyOpenAIKey,
  };
}
export function saveAiSettings(settings: {
  provider: AiProvider; anthropicApiKey: string; openaiApiKey: string; geminiApiKey?: string; deepseekApiKey?: string; summaryProvider?: AiProvider | 'same';
  models: Record<AiProvider, string>; maxTokens: number; temperature: number; summaryModel?: string; recentTurns?: number; summaryInterval?: number; keywordExcludeStatus?: boolean; cacheTtl?: '5m' | '1h';
}) {
  const previous = getAiSettings();
  const save = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  db.transaction(() => {
    // Preserve the misfiled key before replacing the Anthropic slot.
    const openaiKey = settings.openaiApiKey.trim() || previous.openaiApiKey;
    if (openaiKey) save.run('openai_api_key', openaiKey);
    if (settings.anthropicApiKey.trim()) save.run('anthropic_api_key', settings.anthropicApiKey.trim());
    for (const p of ['gemini', 'deepseek'] as const) {
      const key = settings[`${p}ApiKey`]?.trim();
      if (key) save.run(`${p}_api_key`, key);
      save.run(`${p}_model`, settings.models[p] || previous.models[p]);
    }
    if (settings.summaryProvider !== undefined) save.run('summary_provider', settings.summaryProvider);
    save.run('ai_provider', settings.provider);
    save.run('anthropic_model', settings.models.anthropic);
    save.run('openai_model', settings.models.openai);
    save.run('max_tokens', String(settings.maxTokens));
    save.run('temperature', String(settings.temperature));
    save.run('cache_ttl', settings.cacheTtl ?? previous.cacheTtl);
    save.run('summary_model', settings.summaryModel ?? previous.summaryModel);
    save.run('keyword_exclude_status', String(settings.keywordExcludeStatus ?? previous.keywordExcludeStatus));
    save.run('summary_interval', String(settings.summaryInterval ?? previous.summaryInterval));
    save.run('recent_turns', String(settings.recentTurns ?? previous.recentTurns));
  })();
}
