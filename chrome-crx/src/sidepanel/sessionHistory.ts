import type { ApiConversationMessage } from '../messageTypes';
import { isRecord, isTextContentBlock, isToolUseContentBlock } from '../messageTypes';

function isApiUsage(value: unknown): value is ApiConversationMessage['usage'] {
  return (
    isRecord(value) &&
    typeof value.input_tokens === 'number' &&
    typeof value.output_tokens === 'number' &&
    (value.cache_creation_input_tokens === null ||
      typeof value.cache_creation_input_tokens === 'number') &&
    (value.cache_read_input_tokens === null || typeof value.cache_read_input_tokens === 'number')
  );
}

export function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';

  let answerStartIndex = -1;
  for (let index = 0; index < content.length; index += 1) {
    const item = content[index];
    if (isToolUseContentBlock(item) && item.name === 'turn_answer_start') {
      answerStartIndex = index;
      break;
    }
  }

  const relevantContent = answerStartIndex >= 0 ? content.slice(answerStartIndex + 1) : content;
  return relevantContent
    .filter(isTextContentBlock)
    .map((item) => item.text)
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function getHistoryStorageKey(sessionId: string) {
  return `sidepanel_session_${sessionId}`;
}

export function getConversationStorageKey(conversationUuid: string) {
  return `sidepanel_conversation_${conversationUuid}`;
}

export function normalizeHistoricalMessage(raw: unknown): ApiConversationMessage | null {
  if (!isRecord(raw) || (raw.role !== 'user' && raw.role !== 'assistant')) return null;

  const content = raw.content;
  if (typeof content === 'string') {
    return { role: raw.role, content };
  }

  if (Array.isArray(content)) {
    return {
      role: raw.role,
      content,
      ...(typeof raw.id === 'string' ? { id: raw.id } : {}),
      ...(isApiUsage(raw.usage) ? { usage: raw.usage } : {}),
      ...(typeof raw.stop_reason === 'string'
        ? { stop_reason: raw.stop_reason as ApiConversationMessage['stop_reason'] }
        : {})
    };
  }

  return null;
}

export function pickEventMessage(event: unknown): ApiConversationMessage | null {
  const candidates = [
    isRecord(event) ? event.message : undefined,
    isRecord(event) && isRecord(event.data) ? event.data.message : undefined,
    isRecord(event) && isRecord(event.payload) ? event.payload.message : undefined,
    isRecord(event) && isRecord(event.item) ? event.item.message : undefined
  ];

  for (const candidate of candidates) {
    const normalized = normalizeHistoricalMessage(candidate);
    if (normalized) return normalized;
  }

  return normalizeHistoricalMessage(event);
}
