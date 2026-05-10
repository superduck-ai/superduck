export function extractTextFromContent(content: unknown): string {
  if (!Array.isArray(content)) return '';

  let answerStartIndex = -1;
  for (let index = 0; index < content.length; index += 1) {
    const item = content[index];
    if (
      item &&
      typeof item === 'object' &&
      (item as any).type === 'tool_use' &&
      (item as any).name === 'turn_answer_start'
    ) {
      answerStartIndex = index;
      break;
    }
  }

  const relevantContent = answerStartIndex >= 0 ? content.slice(answerStartIndex + 1) : content;
  return relevantContent
    .filter((item) => item && typeof item === 'object' && (item as any).type === 'text')
    .map((item) => (typeof (item as any).text === 'string' ? (item as any).text : ''))
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

export function normalizeHistoricalMessage(raw: any) {
  if (!raw || (raw.role !== 'user' && raw.role !== 'assistant')) return null;

  const content = raw.content;
  if (typeof content === 'string') {
    return { role: raw.role, content };
  }

  if (Array.isArray(content)) {
    return {
      role: raw.role,
      content,
      ...(raw.id ? { id: raw.id } : {}),
      ...(raw.usage ? { usage: raw.usage } : {}),
      ...(raw.stop_reason ? { stop_reason: raw.stop_reason } : {})
    };
  }

  return null;
}

export function pickEventMessage(event: any) {
  const candidates = [
    event?.message,
    event?.data?.message,
    event?.payload?.message,
    event?.item?.message
  ];

  for (const candidate of candidates) {
    const normalized = normalizeHistoricalMessage(candidate);
    if (normalized) return normalized;
  }

  return normalizeHistoricalMessage(event);
}
