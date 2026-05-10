import { compressBase64Image } from '../utils/imageCompressor';

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
  if (error && typeof error === 'object') {
    if (
      'error' in error &&
      typeof (error as any).error === 'object' &&
      (error as any).error &&
      'message' in (error as any).error
    ) {
      return String((error as any).error.message);
    }
    if ('message' in error) return String((error as any).message);
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

export function prepareMessagesForApi(messages: any[]): any[] {
  const filtered = messages.filter(
    (msg: any) => !msg.isLocalOnlyMessage && !('type' in msg && msg.type === 'result')
  );
  let lastAssistantIdx = -1;
  for (let i = filtered.length - 1; i >= 0; i--) {
    if (filtered[i].role === 'assistant') {
      lastAssistantIdx = i;
      break;
    }
  }
  return filtered.map((msg: any, idx: number) => {
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
      const content = JSON.parse(JSON.stringify(msg.content));
      if (idx === lastAssistantIdx && content.length > 0) {
        content[content.length - 1].cache_control = { type: 'ephemeral' };
      }
      return { role, content };
    }
    return { role, content: '' };
  });
}

export async function formatToolResult(result: any): Promise<any> {
  if (result?.error) return result.error;
  const parts: any[] = [];
  if (result?.output) {
    parts.push({ type: 'text', text: result.output });
  }
  if (result?.base64Image) {
    const rawMediaType = result.imageFormat ? `image/${result.imageFormat}` : 'image/png';
    const { data, mediaType } = await compressBase64Image(result.base64Image, rawMediaType);
    parts.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data }
    });
  }
  if (parts.length > 0) return parts;
  if (result && typeof result === 'object' && 'content' in result) {
    return result.content;
  }
  return '';
}
