// Encoded image bytes, excluding the data URL/base64 overhead.
export function imageByteSize(url: string): number | undefined {
  const comma = url.indexOf(',');
  if (comma < 0 || !url.slice(0, comma).match(/^data:image\/[^;]+;base64$/i)) return undefined;
  const data = url.slice(comma + 1).replace(/\s/g, '');
  return Math.max(0, Math.floor(data.length * 3 / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0));
}
export function formatImageSize(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '용량 미확인';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
