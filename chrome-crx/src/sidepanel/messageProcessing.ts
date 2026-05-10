import { compressBase64Image } from '../utils/imageCompressor';
import type { ToolResult } from '../mcpRuntime/pageToolsSupport/types';
import type { ApiConversationMessage, ApiInputContentBlock } from '../messageTypes';
import { isRecord } from '../messageTypes';

type MessageForApi = ApiConversationMessage & { type?: string };

interface ToolExecutionResult extends Partial<ToolResult> {
  content?: ApiConversationMessage['content'];
}

export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    const match = error.match(/^(\d{3})\s+(\{.+\})$/s);
    let raw = error;
    if (match) raw = match[2];
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error?.message) return parsed.error.message;
      if (parsed?.message) return parsed.message;
    } catch {
      // not JSON
    }
    return error;
  }
  if (error instanceof Error) {
    const text = error.message;
    const match = text.match(/^(\d{3})\s+(\{.+\})$/s);
    let raw = text;
    if (match) raw = match[2];
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error?.message) return parsed.error.message;
      if (parsed?.message) return parsed.message;
    } catch {
      // not JSON
    }
    return error.message;
  }
  if (isRecord(error)) {
    if (isRecord(error.error) && typeof error.error.message === 'string') {
      return error.error.message;
    }
    if ('message' in error) return String(error.message);
  }
  return String(error);
}

export function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number(part) || 0);
  const rightParts = right.split('.').map((part) => Number(part) || 0);
  const maxLength = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const a = leftParts[index] || 0;
    const b = rightParts[index] || 0;
    if (a < b) return -1;
    if (a > b) return 1;
  }
  return 0;
}

export function prepareMessagesForApi(messages: MessageForApi[]): ApiConversationMessage[] {
  const filtered = messages.filter((msg) => !msg.isLocalOnlyMessage && msg.type !== 'result');
  let lastAssistantIdx = -1;
  for (let i = filtered.length - 1; i >= 0; i -= 1) {
    if (filtered[i].role === 'assistant') {
      lastAssistantIdx = i;
      break;
    }
  }

  return filtered.map((msg, idx) => {
    const role = msg.role;
    if (typeof msg.content === 'string') {
      if (idx === lastAssistantIdx) {
        return {
          role,
          content: [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }]
        };
      }
      return { role, content: msg.content };
    }
    if (Array.isArray(msg.content)) {
      const content = JSON.parse(JSON.stringify(msg.content)) as ApiInputContentBlock[];
      const lastBlock = content[content.length - 1];
      if (idx === lastAssistantIdx && lastBlock && isRecord(lastBlock)) {
        lastBlock.cache_control = { type: 'ephemeral' };
      }
      return { role, content };
    }
    return { role, content: '' };
  });
}

export async function formatToolResult(
  result: ToolExecutionResult
): Promise<ApiConversationMessage['content']> {
  if (result?.error) return result.error;
  const parts: ApiInputContentBlock[] = [];
  if (result?.output) {
    parts.push({ type: 'text', text: result.output });
  }
  if (result?.base64Image) {
    const rawMediaType = result.imageFormat ? `image/${result.imageFormat}` : 'image/png';
    const { data, mediaType } = await compressBase64Image(result.base64Image, rawMediaType);
    const normalizedMediaType =
      mediaType === 'image/jpeg' ||
      mediaType === 'image/png' ||
      mediaType === 'image/gif' ||
      mediaType === 'image/webp'
        ? mediaType
        : 'image/png';
    parts.push({
      type: 'image',
      source: { type: 'base64', media_type: normalizedMediaType, data }
    });
  }
  if (parts.length > 0) return parts;
  if (Array.isArray(result.content) || typeof result.content === 'string') {
    return result.content;
  }
  return '';
}
