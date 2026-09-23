import { nasMediaPrompt } from '@/lib/nas-media';
import { visibleAnswer } from '@/lib/visible-answer';
import { withoutKeywordBook, keywordInstructions, keywordSearchText, directKeywordSources, type KeywordSelection } from '@/lib/keyword-book';
import { claimGeneration, updateGeneration, generationStopRequested } from '@/lib/chat-generation';
import { globalPromptInstructions } from '@/lib/global-prompt';
import { playerAgencyInstructions } from '@/lib/player-agency';
// app/api/chat/route.ts
import db from '@/lib/db';
import { chatProfile, chatProfilePrompt } from '@/lib/chat-profile';
import { readMedia } from '@/lib/server-media';
import { automaticMedia, replaceUserName, withoutLegacyMediaCatalog } from '@/lib/chat-media';
import { after } from 'next/server';
import { memoryContext, drainMemory, historyFingerprint, invalidateMemory } from '@/lib/memory';
import { AiError, describeAiError, openAiTextStream } from '@/lib/ai';
import type { AiProvider } from '@/lib/ai-config';
import { getAiSettings } from '@/lib/settings';
import { characterInstructions, parseEditorConfig } from '@/lib/prompt-templates';

export async function POST(req: Request) {
  let job: { id: string; token: string } | undefined;
  let provider: AiProvider | undefined;
  try {
    const { 
      messages,
      continueStory,
      regenerateMessageId,
      requestToken, 
      characterId, 
      sessionId,
      isNovelMode,
      startSetting,
    } = await req.json();

    provider = getAiSettings().provider;
    if (typeof sessionId !== 'string' || typeof characterId !== 'string') throw new AiError('채팅방을 다시 열어 주세요.');
    const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ? AND character_id = ?').get(sessionId, characterId) as any;
    if (!session) throw new AiError('채팅방을 찾을 수 없습니다.', 404);
    const isRegeneration = regenerateMessageId !== undefined;
    if (requestToken !== undefined && (typeof requestToken !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestToken))) throw new AiError('생성 요청을 확인해 주세요.');
    if (isRegeneration && (typeof regenerateMessageId !== 'string' || !/^\d+$/.test(regenerateMessageId) || !Number.isSafeInteger(Number(regenerateMessageId)))) throw new AiError('재생성할 답변을 확인해 주세요.');
    let regenerationUser: any = null;
    if (isRegeneration) {
      const target = db.prepare('SELECT role FROM messages WHERE session_id=? AND id=?').get(sessionId, Number(regenerateMessageId)) as any;
      regenerationUser = db.prepare('SELECT id,role,content FROM messages WHERE session_id=? AND id<? ORDER BY id DESC LIMIT 1').get(sessionId, Number(regenerateMessageId)) as any;
      if (target?.role !== 'assistant' || regenerationUser?.role !== 'user') throw new AiError('직전 사용자 메시지가 있는 AI 답변만 재생성할 수 있습니다.');
    }
    const isContinuation = isRegeneration ? regenerationUser.content === '[이어서 진행]' : continueStory === true;
    if (!isRegeneration && isContinuation && (!Array.isArray(messages) || messages.length !== 1 || messages[0]?.role !== 'user' || typeof messages[0]?.content !== 'string' || messages[0].content.trim())) throw new AiError('이어서 진행 요청을 확인해 주세요.');
    if (!isRegeneration && !isContinuation && (!Array.isArray(messages) || !messages.length || messages.some((m: any) =>
      !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim()
    ) || messages[messages.length - 1].role !== 'user')) throw new AiError('전송할 대화 내용이 올바르지 않습니다.');

    const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId) as any;
    if (!character) {
      throw new AiError('캐릭터를 찾을 수 없습니다.', 404);
    }

    // Save the turn atomically only after successful generation.
    const lastMsg = isRegeneration ? regenerationUser : isContinuation ? { role: 'user', content: '[이어서 진행]' } : messages[messages.length - 1];

    const selectedProfile = chatProfile(session);
    const userPersonaPrompt = chatProfilePrompt(selectedProfile);

    // 🔥 유저노트 최우선 절대 기억 프롬프트 주입
    const userNote = session.user_note || '';
    const userNotePrompt = userNote && userNote.trim()
      ? `\n\n[⚠️ 최우선 기억 유저노트 (반드시 100% 반영)]\n아래 내용은 사용자가 지정한 이 채팅방의 핵심 필수 설정입니다. 스토리 서술과 대화 시 아래 내용을 절대 잊지 말고 항상 반영하세요:\n${userNote.trim()}`
      : '';

    const startSettingPrompt = startSetting
      ? `\n\n[사용자가 선택한 시작 상황]\n- 설정명: ${startSetting.name || startSetting.label || '기본 설정'}\n${startSetting.situation ? `- 시작 상황: ${startSetting.situation}` : ''}\n이 시작 상황을 현재 대화의 기준으로 우선 적용하세요.`
      : '';

    let savedSettings: any[] = [];
    try { savedSettings = JSON.parse(character.start_settings || '[]').filter((item: any) => item?.prologue?.trim()); } catch {}
    const savedStart = savedSettings[session.start_setting_index] || savedSettings[0];
    const recentKeywordMessages = db.prepare('SELECT role, content FROM messages WHERE session_id = ? AND id < ? ORDER BY id DESC LIMIT 4').all(sessionId, regenerationUser?.id ?? Number.MAX_SAFE_INTEGER) as { role: string; content: string }[];
    const mediaContext = nasMediaPrompt(automaticMedia(readMedia(characterId).items, Number(savedStart?.id ?? 0)),
      recentKeywordMessages.filter(message => message.role === 'assistant').reverse().map(message => message.content));
    const mediaPrompt = mediaContext.prompt;

    // 시스템 프롬프트 구성
    const fixedPrompt = characterInstructions({ ...withoutKeywordBook(character), system_prompt: withoutLegacyMediaCatalog(withoutKeywordBook(character).system_prompt) });
    const basePrompt = `${globalPromptInstructions()}${startSettingPrompt}${userPersonaPrompt}${userNotePrompt}`;
    const systemPrompt = isNovelMode && !parseEditorConfig(character.editor_config)
      ? `${basePrompt}

[장편 인터랙티브 웹소설 연출 및 서술 지침]
당신은 최고 수준의 정통 웹소설/비주얼 노벨 작가입니다. 호흡이 길고 디테일하며 문학적인 풍부한 서술을 작성하세요.
1. [첫 줄 상태바 필수]: 답변의 가장 첫 줄은 반드시 다음 서식으로 시작:
| #장면번호 | 🌍 현재 장소 및 배경 | 🌞 시간대 / 날씨 / 분위기 | 🟢
2. [풍부한 분량과 묘사]: 최소 4~6문단 이상의 넉넉한 분량으로 오감(시각, 청각 등)과 감정선을 깊이 있게 서술하세요.
3. [대사 서식 분리]: 인물의 대사는 반드시 줄바꿈하여 아래 서식으로 작성:
| ${character.name} | "대사 내용"
4. [상호작용 여운]: 장면의 끝에는 플레이어의 다음 선택을 유도하는 여운을 남기세요.`
      : basePrompt;

    const keywordExcludeStatus = getAiSettings().keywordExcludeStatus;
    const keywordItems: KeywordSelection[] = [];
    const keywordPrompt = keywordInstructions(character.editor_config, Number(savedStart?.id ?? 0),
      [...recentKeywordMessages.map(message => replaceUserName(keywordSearchText(message.role === 'assistant' ? visibleAnswer(message.content) : message.content, message.role, keywordExcludeStatus), selectedProfile?.name)), replaceUserName(lastMsg.content, selectedProfile?.name)], keywordItems, [...recentKeywordMessages.map((message, index) => `직전 ${index + 1}번째 메시지 · ${message.role === 'assistant' ? 'AI' : '사용자'}`), '이번 사용자 입력'], directKeywordSources(recentKeywordMessages.map(message => ({ ...message, content: replaceUserName(message.role === 'assistant' ? visibleAnswer(message.content) : message.content, selectedProfile?.name) })), replaceUserName(lastMsg.content, selectedProfile?.name)));
    const context = memoryContext(sessionId, regenerationUser?.id, lastMsg.content);
    const profileName = selectedProfile?.name;
    context.prompt = replaceUserName(context.prompt, profileName);
    const stableMemory = mediaContext.encode(replaceUserName(context.stablePrompt, profileName));
    const dynamicMemory = mediaContext.encode(replaceUserName(context.dynamicPrompt, profileName));
    context.messages = context.messages.map(message => ({ ...message, content: replaceUserName(message.content, profileName) }));
    const cachePrefix = mediaContext.encode(replaceUserName(fixedPrompt, profileName), true) + mediaPrompt;
    const editablePrompt = mediaContext.encode(replaceUserName(systemPrompt, profileName), true);
    const fingerprint = historyFingerprint(sessionId);
    const token = claimGeneration(sessionId, lastMsg.content, requestToken, isRegeneration ? Number(regenerateMessageId) : undefined);
    if (!token) throw new AiError('이 채팅방에서 답변을 생성 중입니다.', 409);
    job = { id: sessionId, token };
    let committed = false;
    let finish!: () => void;
    const finished = new Promise<void>(resolve => { finish = resolve; });
    after(async () => { await finished; if (committed) await drainMemory(sessionId); });

    let fullText = '';
    const encoder = new TextEncoder();
    let cancelled = false;
    const abortController = new AbortController();
    const stopRequested = () => generationStopRequested(sessionId, token);
    const monitor = setInterval(() => { if (stopRequested()) abortController.abort(); }, 150);
    const customReadable = new ReadableStream({
      async start(controller) {
        let stream: Awaited<ReturnType<typeof openAiTextStream>> | undefined;
        const send = (event: object) => {
          if (!cancelled) { try { controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')); } catch { cancelled = true; } }
        };
        const commit = (stopped: boolean) => {
          // Interrupted regeneration keeps the original answer and following history.
          if (stopped && isRegeneration) return;
          db.transaction(() => {
            if (!db.prepare('SELECT id FROM chat_sessions WHERE id = ?').get(sessionId)) throw new AiError('채팅방이 삭제됐습니다.', 409);
            if (historyFingerprint(sessionId) !== fingerprint) throw new AiError('다른 창에서 대화가 변경됐습니다. 새로고침해 주세요.', 409);
            if (isRegeneration) {
              db.prepare('UPDATE messages SET content=? WHERE session_id=? AND id=?').run(fullText, sessionId, Number(regenerateMessageId));
              db.prepare('DELETE FROM messages WHERE session_id=? AND id>?').run(sessionId, Number(regenerateMessageId));
              invalidateMemory(sessionId);
            } else {
              const insert = db.prepare('INSERT INTO messages (character_id, session_id, role, content) VALUES (?, ?, ?, ?)');
              insert.run(characterId, sessionId, 'user', lastMsg.content);
              if (fullText.trim()) insert.run(characterId, sessionId, 'assistant', fullText);
            }
            db.prepare('UPDATE chat_sessions SET has_started = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);
          })();
          committed = true;
        };
        try {
          if (stopRequested()) abortController.abort();
          if (!abortController.signal.aborted) {
            stream = await openAiTextStream(cachePrefix + stableMemory + editablePrompt + mediaContext.encode(replaceUserName(keywordPrompt, profileName), true) + dynamicMemory + playerAgencyInstructions(profileName, isContinuation), [...context.messages, { role: 'user' as const, content: replaceUserName(lastMsg.content, profileName) }].map(message => ({ ...message, content: mediaContext.encode(message.content, message.role === 'user') })), abortController.signal, undefined, true, sessionId, cachePrefix, { kind: isRegeneration ? '재생성' : '채팅', inputBreakdown: {
              cachedChars: Array.from(cachePrefix).length,
              memoryCachedChars: Array.from(stableMemory).length,
              keywordChars: Array.from(mediaContext.encode(replaceUserName(keywordPrompt, profileName), true)).length,
              memoryChars: Array.from(mediaContext.encode(context.prompt)).length,
              memoryCount: context.memoryCount,
              memory: context.diagnostics,
              keywords: keywordItems,
              keywordExcludeStatus,
              media: mediaContext.diagnostics,
            } }, stableMemory, editablePrompt);
            for await (const text of mediaContext.restore(stream.text)) {
              if (stopRequested()) { abortController.abort(); break; }
              fullText += text;
              updateGeneration(sessionId, token, fullText);
              send({ type: 'delta', text });
            }
          }
          const stopped = stopRequested();
          if (!stopped && !fullText.trim()) throw new AiError('AI 응답이 비어 있습니다. 모델이나 출력량을 확인해 주세요.', 502);
          commit(stopped);
          updateGeneration(sessionId, token, fullText, stopped ? 'stopped' : 'done');
          send({ type: 'done', stopped });
        } catch (error) {
          if (stopRequested() && !committed) {
            try {
              commit(true);
              updateGeneration(sessionId, token, fullText, 'stopped');
              send({ type: 'done', stopped: true });
            } catch (saveError) {
              const failure = describeAiError(saveError, provider);
              updateGeneration(sessionId, token, fullText, 'error', failure.error);
              send({ type: 'error', ...failure });
            }
          } else {
            const failure = describeAiError(error, provider);
            updateGeneration(sessionId, token, fullText, 'error', failure.error);
            send({ type: 'error', ...failure });
          }
        } finally {
          clearInterval(monitor);
          stream?.abort();
          finish();
          if (!cancelled) { try { controller.close(); } catch {} }
        }
      },
      cancel() { cancelled = true; },
    });

    return new Response(customReadable, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error: unknown) {
    const result = describeAiError(error, provider);
    if (job) updateGeneration(job.id, job.token, '', 'error', result.error);
    console.error('Chat API Error:', { provider, status: result.status });
    return Response.json(result, { status: result.status });
  }
}
