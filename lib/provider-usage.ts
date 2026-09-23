import type { Usage } from '@/lib/stars';
// Cached input is a subset of total input in OpenAI-compatible APIs.
export function compatibleUsage(raw: any, responses = false): Usage | null {
  if (!raw) return null;
  const total = responses ? raw.input_tokens : raw.prompt_tokens;
  const output = responses ? raw.output_tokens : raw.completion_tokens;
  const details = responses ? raw.input_tokens_details : raw.prompt_tokens_details;
  const read = details?.cached_tokens ?? raw.prompt_cache_hit_tokens ?? 0;
  const write = details?.cache_creation_tokens ?? details?.cache_write_tokens ?? raw.cache_creation_input_tokens ?? 0;
  if (![total, output, read, write].every(n => Number.isSafeInteger(n) && n >= 0) || read + write > total) return null;
  return { input: total - read - write, output, write, read };
}
