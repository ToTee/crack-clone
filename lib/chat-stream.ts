export async function consumeChatResponse(response: Response, onText: (text: string) => void) {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(typeof data?.error === 'string' ? data.error : `요청 실패 (HTTP ${response.status}). NAS 로그를 확인해 주세요.`);
  }
  if (!response.body) throw new Error('서버 응답이 없습니다.');
  if (!response.headers.get('content-type')?.includes('application/x-ndjson')) {
    await response.body.cancel();
    throw new Error('서버와 화면 버전이 다릅니다. 업데이트를 재빌드하고 Ctrl+F5로 새로고침해 주세요.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let completed = false;
  const parseLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'error') throw new Error(event.error || 'AI 응답이 중단됐습니다.');
    if (event.type === 'delta' && typeof event.text === 'string') {
      text += event.text;
      onText(text);
    }
    if (event.type === 'done') completed = true;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        parseLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
      if (done) { parseLine(buffer); break; }
    }
    if (!completed) throw new Error('응답 완료를 확인하지 못했습니다. 새로고침해서 저장 여부를 확인한 뒤 다시 시도해 주세요.');
  } finally {
    if (!completed) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
