import type {
  ApiConversationMessage,
  ApiImageContentBlock,
  ApiResponseMessage,
  ApiTextContentBlock,
  ApiToolResultBlock,
  ApiToolUseBlock
} from '../messageTypes';
import {
  isImageContentBlock,
  isRecord,
  isTextContentBlock,
  isToolResultContentBlock,
  isToolUseContentBlock
} from '../messageTypes';

interface ToolSchemaLike {
  name?: string;
  description?: string;
  input_schema?: unknown;
  cache_control?: unknown;
}

export function getString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function getNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function getMessages(params: Record<string, unknown>): ApiConversationMessage[] {
  return Array.isArray(params.messages) ? (params.messages as ApiConversationMessage[]) : [];
}

export function normalizeSystemText(system: unknown): string {
  if (typeof system === 'string') return system;
  if (!Array.isArray(system)) return '';
  return system
    .filter(isTextContentBlock)
    .map((block) => block.text)
    .join('\n');
}

function extractText(content: unknown, separator = '\n'): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(isTextContentBlock)
    .map((block) => block.text)
    .join(separator);
}

function imageBlockToDataURL(block: ApiImageContentBlock): string | null {
  const source = block.source;
  if (!isRecord(source)) return null;
  if (source.type === 'base64' && typeof source.data === 'string') {
    const mediaType = typeof source.media_type === 'string' ? source.media_type : 'image/png';
    return `data:${mediaType};base64,${source.data}`;
  }
  if (source.type === 'url' && typeof source.url === 'string') return source.url;
  return null;
}

function toolResultToText(block: ApiToolResultBlock): string {
  if (typeof block.content === 'string') return block.content;
  return extractText(block.content, '\n');
}

export function safeParseJSON(value: string): unknown {
  if (!value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return { input: value };
  }
}

function normalizeToolSchemas(tools: unknown): ToolSchemaLike[] {
  return Array.isArray(tools) ? (tools.filter(isRecord) as ToolSchemaLike[]) : [];
}

function toOpenAIResponsesFunctionCallId(toolUseId: string): string {
  const id = toolUseId.trim();
  if (id.startsWith('fc_')) return id;
  if (id.startsWith('call_')) return `fc_${id.slice('call_'.length)}`;
  return `fc_${id || crypto.randomUUID()}`;
}

export function toOpenAIChatTools(tools: unknown): unknown[] | undefined {
  const converted = normalizeToolSchemas(tools)
    .filter((tool) => typeof tool.name === 'string' && tool.name.length > 0)
    .map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description ?? '',
        parameters: tool.input_schema ?? { type: 'object', properties: {} }
      }
    }));
  return converted.length > 0 ? converted : undefined;
}

export function toOpenAIResponsesTools(tools: unknown): unknown[] | undefined {
  const converted = normalizeToolSchemas(tools)
    .filter((tool) => typeof tool.name === 'string' && tool.name.length > 0)
    .map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description ?? '',
      parameters: tool.input_schema ?? { type: 'object', properties: {} }
    }));
  return converted.length > 0 ? converted : undefined;
}

export function toOpenAIChatMessages(params: Record<string, unknown>): unknown[] {
  const messages: unknown[] = [];
  const system = normalizeSystemText(params.system);
  if (system) messages.push({ role: 'system', content: system });

  for (const message of getMessages(params)) {
    if (typeof message.content === 'string') {
      messages.push({ role: message.role, content: message.content });
      continue;
    }
    if (!Array.isArray(message.content)) continue;

    const toolResults = message.content.filter(isToolResultContentBlock);
    if (toolResults.length > 0) {
      for (const toolResult of toolResults) {
        messages.push({
          role: 'tool',
          tool_call_id: toolResult.tool_use_id,
          content: toolResultToText(toolResult)
        });
      }
      continue;
    }

    const textBlocks = message.content.filter(isTextContentBlock);
    const imageBlocks = message.content.filter(isImageContentBlock);
    const toolUseBlocks = message.content.filter(isToolUseContentBlock);

    if (message.role === 'assistant') {
      messages.push({
        role: 'assistant',
        content: textBlocks.map((block) => block.text).join('\n') || null,
        ...(toolUseBlocks.length > 0
          ? {
              tool_calls: toolUseBlocks.map((toolUse) => ({
                id: toolUse.id,
                type: 'function',
                function: {
                  name: toolUse.name,
                  arguments: JSON.stringify(toolUse.input ?? {})
                }
              }))
            }
          : {})
      });
      continue;
    }

    const contentParts: unknown[] = [];
    for (const block of textBlocks) contentParts.push({ type: 'text', text: block.text });
    for (const block of imageBlocks) {
      const imageUrl = imageBlockToDataURL(block);
      if (imageUrl) contentParts.push({ type: 'image_url', image_url: { url: imageUrl } });
    }
    messages.push({
      role: 'user',
      content: contentParts.length > 0 ? contentParts : ''
    });
  }

  return messages;
}

export function toOpenAIResponsesInput(params: Record<string, unknown>): unknown[] {
  const input: unknown[] = [];
  for (const message of getMessages(params)) {
    if (typeof message.content === 'string') {
      input.push({ role: message.role, content: [{ type: 'input_text', text: message.content }] });
      continue;
    }
    if (!Array.isArray(message.content)) continue;

    const toolResults = message.content.filter(isToolResultContentBlock);
    if (toolResults.length > 0) {
      for (const toolResult of toolResults) {
        input.push({
          type: 'function_call_output',
          call_id: toolResult.tool_use_id,
          output: toolResultToText(toolResult)
        });
      }
      continue;
    }

    const content: unknown[] = [];
    for (const block of message.content) {
      if (isTextContentBlock(block)) {
        content.push({
          type: 'input_text',
          text: block.text
        });
        continue;
      }
      if (isImageContentBlock(block)) {
        const imageUrl = imageBlockToDataURL(block);
        if (imageUrl) content.push({ type: 'input_image', image_url: imageUrl });
      }
    }

    const toolUses = message.content.filter(isToolUseContentBlock);
    if (message.role === 'assistant' && toolUses.length > 0) {
      if (content.length > 0) input.push({ role: 'assistant', content });
      for (const toolUse of toolUses) {
        input.push({
          type: 'function_call',
          id: toOpenAIResponsesFunctionCallId(toolUse.id),
          call_id: toolUse.id,
          name: toolUse.name,
          arguments: JSON.stringify(toolUse.input ?? {})
        });
      }
      continue;
    }

    input.push({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content
    });
  }
  return input;
}

function openAIUsageToAnthropic(usage: unknown): ApiResponseMessage['usage'] {
  if (!isRecord(usage)) {
    return { input_tokens: 0, output_tokens: 0 } as ApiResponseMessage['usage'];
  }
  const inputTokens = getNumber(usage.prompt_tokens ?? usage.input_tokens);
  const outputTokens = getNumber(usage.completion_tokens ?? usage.output_tokens);
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens
  } as ApiResponseMessage['usage'];
}

export function chatCompletionToMessage(
  completion: unknown,
  fallbackText = ''
): ApiResponseMessage {
  const completionRecord = isRecord(completion) ? completion : {};
  const choices = Array.isArray(completionRecord.choices) ? completionRecord.choices : [];
  const firstChoice = isRecord(choices[0]) ? choices[0] : {};
  const message = isRecord(firstChoice.message) ? firstChoice.message : {};
  const content: Array<ApiTextContentBlock | ApiToolUseBlock> = [];
  const text = getString(message.content) || fallbackText;
  if (text) content.push({ type: 'text', text });

  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  for (const toolCall of toolCalls) {
    if (!isRecord(toolCall) || !isRecord(toolCall.function)) continue;
    const id = getString(toolCall.id) || `toolu_${crypto.randomUUID()}`;
    const name = getString(toolCall.function.name);
    if (!name) continue;
    content.push({
      type: 'tool_use',
      id,
      name,
      input: safeParseJSON(getString(toolCall.function.arguments))
    });
  }

  const finishReason = getString(firstChoice.finish_reason);
  return {
    id: getString(completionRecord.id) || `msg_${crypto.randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model: getString(completionRecord.model),
    content,
    stop_reason:
      finishReason === 'tool_calls'
        ? 'tool_use'
        : finishReason === 'length'
          ? 'max_tokens'
          : 'end_turn',
    stop_sequence: null,
    usage: openAIUsageToAnthropic(completionRecord.usage)
  } as ApiResponseMessage;
}

export function responseToMessage(response: unknown, fallbackText = ''): ApiResponseMessage {
  const responseRecord = isRecord(response) ? response : {};
  const content: Array<ApiTextContentBlock | ApiToolUseBlock> = [];
  const output = Array.isArray(responseRecord.output) ? responseRecord.output : [];

  for (const item of output) {
    if (!isRecord(item)) continue;
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (isRecord(part) && typeof part.text === 'string') {
          content.push({ type: 'text', text: part.text });
        }
      }
    }
    if (item.type === 'function_call') {
      const id = getString(item.call_id) || getString(item.id) || `toolu_${crypto.randomUUID()}`;
      const name = getString(item.name);
      if (!name) continue;
      content.push({
        type: 'tool_use',
        id,
        name,
        input: safeParseJSON(getString(item.arguments))
      });
    }
  }

  if (content.length === 0 && fallbackText) content.push({ type: 'text', text: fallbackText });
  const hasToolUse = content.some(isToolUseContentBlock);
  return {
    id: getString(responseRecord.id) || `msg_${crypto.randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model: getString(responseRecord.model),
    content,
    stop_reason: hasToolUse ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: openAIUsageToAnthropic(responseRecord.usage)
  } as ApiResponseMessage;
}

export function extractResponseTextDelta(event: unknown): string {
  if (!isRecord(event)) return '';
  if (event.type === 'response.output_text.delta') return getString(event.delta);
  if (event.type === 'response.text.delta') return getString(event.delta);
  return '';
}
