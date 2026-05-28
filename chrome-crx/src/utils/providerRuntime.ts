import OpenAI from 'openai';
import { MessagesClient } from '../mcpServersStore';
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
import { DEFAULT_BASE_URL, normalizeProviderBaseURL, type AiProvider } from './providerStore';

type AnthropicSdkClient = InstanceType<typeof MessagesClient>;
type RuntimeEvent = 'connect' | 'text' | 'end';
type RuntimeHandler = (arg: string) => void;

export interface ProviderRuntime {
  create(params: Record<string, unknown>, options?: unknown): Promise<ApiResponseMessage>;
  stream(
    params: Record<string, unknown>,
    options?: { signal?: AbortSignal }
  ): ProviderRuntimeStream;
}

export interface ProviderRuntimeStream {
  response?: { headers: Headers };
  on(event: RuntimeEvent, handler: RuntimeHandler): ProviderRuntimeStream;
  once(event: RuntimeEvent, handler: RuntimeHandler): ProviderRuntimeStream;
  finalMessage(): Promise<ApiResponseMessage>;
}

interface OpenAIRuntimeConfig {
  apiKey: string;
  baseURL: string;
  protocol: 'chat' | 'responses';
}

interface ToolSchemaLike {
  name?: string;
  description?: string;
  input_schema?: unknown;
  cache_control?: unknown;
}

interface OpenAIToolCallAccumulator {
  id: string;
  name: string;
  arguments: string;
}

class AsyncProviderStream implements ProviderRuntimeStream {
  response?: { headers: Headers };
  private listeners: Record<RuntimeEvent, RuntimeHandler[]> = {
    connect: [],
    text: [],
    end: []
  };
  private onceListeners: Record<RuntimeEvent, RuntimeHandler[]> = {
    connect: [],
    text: [],
    end: []
  };
  private finalPromise: Promise<ApiResponseMessage>;

  constructor(start: (stream: AsyncProviderStream) => Promise<ApiResponseMessage>) {
    this.finalPromise = start(this).finally(() => {
      this.emit('end');
    });
  }

  on(event: RuntimeEvent, handler: RuntimeHandler): ProviderRuntimeStream {
    this.listeners[event].push(handler);
    return this;
  }

  once(event: RuntimeEvent, handler: RuntimeHandler): ProviderRuntimeStream {
    this.onceListeners[event].push(handler);
    return this;
  }

  finalMessage(): Promise<ApiResponseMessage> {
    return this.finalPromise;
  }

  emit(event: RuntimeEvent, arg = ''): void {
    for (const handler of this.listeners[event]) handler(arg);
    const onceHandlers = this.onceListeners[event];
    this.onceListeners[event] = [];
    for (const handler of onceHandlers) handler(arg);
  }
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function getNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function getMessages(params: Record<string, unknown>): ApiConversationMessage[] {
  return Array.isArray(params.messages) ? (params.messages as ApiConversationMessage[]) : [];
}

function normalizeSystemText(system: unknown): string {
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

function safeParseJSON(value: string): unknown {
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

function toOpenAIChatTools(tools: unknown): unknown[] | undefined {
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

function toOpenAIResponsesTools(tools: unknown): unknown[] | undefined {
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

function toOpenAIChatMessages(params: Record<string, unknown>): unknown[] {
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

function toOpenAIResponsesInput(params: Record<string, unknown>): unknown[] {
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

function chatCompletionToMessage(completion: unknown, fallbackText = ''): ApiResponseMessage {
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

function responseToMessage(response: unknown, fallbackText = ''): ApiResponseMessage {
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

function extractResponseTextDelta(event: unknown): string {
  if (!isRecord(event)) return '';
  if (event.type === 'response.output_text.delta') return getString(event.delta);
  if (event.type === 'response.text.delta') return getString(event.delta);
  return '';
}

function makeOpenAI(config: OpenAIRuntimeConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL || DEFAULT_BASE_URL.openai,
    dangerouslyAllowBrowser: true
  });
}

export function createAnthropicRuntime(client: AnthropicSdkClient): ProviderRuntime {
  return {
    async create(params, options) {
      return await client.beta.messages.create(params as never, options as never);
    },
    stream(params, options) {
      return client.beta.messages.stream(
        params as never,
        options as never
      ) as ProviderRuntimeStream;
    }
  };
}

export function createOpenAIRuntime(config: OpenAIRuntimeConfig): ProviderRuntime {
  const client = makeOpenAI(config);
  if (config.protocol === 'chat') {
    return {
      async create(params) {
        const chatTools = toOpenAIChatTools(params.tools);
        const completion = await client.chat.completions.create({
          model: getString(params.model),
          messages: toOpenAIChatMessages(params) as never,
          max_completion_tokens: getNumber(params.max_tokens, 1024),
          tools: chatTools as never,
          ...(chatTools ? { tool_choice: 'auto' as const } : {})
        });
        return chatCompletionToMessage(completion);
      },
      stream(params, options) {
        return new AsyncProviderStream(async (runtimeStream) => {
          const chatTools = toOpenAIChatTools(params.tools);
          const stream = await client.chat.completions.create(
            {
              model: getString(params.model),
              messages: toOpenAIChatMessages(params) as never,
              max_completion_tokens: getNumber(params.max_tokens, 1024),
              tools: chatTools as never,
              ...(chatTools ? { tool_choice: 'auto' as const } : {}),
              stream: true
            },
            { signal: options?.signal }
          );
          runtimeStream.response = { headers: new Headers() };
          runtimeStream.emit('connect');

          let fullText = '';
          const toolCalls = new Map<number, OpenAIToolCallAccumulator>();
          for await (const chunk of stream as AsyncIterable<unknown>) {
            const chunkRecord = isRecord(chunk) ? chunk : {};
            const choices = Array.isArray(chunkRecord.choices) ? chunkRecord.choices : [];
            const firstChoice = isRecord(choices[0]) ? choices[0] : {};
            const delta = isRecord(firstChoice.delta) ? firstChoice.delta : {};
            const textDelta = getString(delta.content);
            if (textDelta) {
              fullText += textDelta;
              runtimeStream.emit('text', textDelta);
            }
            const deltaToolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
            for (const deltaToolCall of deltaToolCalls) {
              if (!isRecord(deltaToolCall)) continue;
              const index = getNumber(deltaToolCall.index, 0);
              const current = toolCalls.get(index) ?? { id: '', name: '', arguments: '' };
              current.id = getString(deltaToolCall.id) || current.id;
              if (isRecord(deltaToolCall.function)) {
                current.name = getString(deltaToolCall.function.name) || current.name;
                current.arguments += getString(deltaToolCall.function.arguments);
              }
              toolCalls.set(index, current);
            }
          }

          const toolUseBlocks: ApiToolUseBlock[] = [...toolCalls.values()]
            .filter((toolCall) => toolCall.name)
            .map((toolCall) => ({
              type: 'tool_use',
              id: toolCall.id || `toolu_${crypto.randomUUID()}`,
              name: toolCall.name,
              input: safeParseJSON(toolCall.arguments)
            }));
          if (toolUseBlocks.length > 0) {
            return {
              id: `msg_${crypto.randomUUID()}`,
              type: 'message',
              role: 'assistant',
              model: getString(params.model),
              content: [
                ...(fullText ? [{ type: 'text' as const, text: fullText }] : []),
                ...toolUseBlocks
              ],
              stop_reason: 'tool_use',
              stop_sequence: null,
              usage: { input_tokens: 0, output_tokens: 0 }
            } as ApiResponseMessage;
          }
          return chatCompletionToMessage({}, fullText);
        });
      }
    };
  }

  return {
    async create(params) {
      const response = await client.responses.create({
        model: getString(params.model),
        instructions: normalizeSystemText(params.system),
        input: toOpenAIResponsesInput(params) as never,
        max_output_tokens: getNumber(params.max_tokens, 1024),
        tools: toOpenAIResponsesTools(params.tools) as never
      });
      return responseToMessage(response);
    },
    stream(params, options) {
      return new AsyncProviderStream(async (runtimeStream) => {
        const stream = await client.responses.create(
          {
            model: getString(params.model),
            instructions: normalizeSystemText(params.system),
            input: toOpenAIResponsesInput(params) as never,
            max_output_tokens: getNumber(params.max_tokens, 1024),
            tools: toOpenAIResponsesTools(params.tools) as never,
            stream: true
          },
          { signal: options?.signal }
        );
        runtimeStream.response = { headers: new Headers() };
        runtimeStream.emit('connect');

        let fullText = '';
        let finalResponse: unknown;
        for await (const event of stream as AsyncIterable<unknown>) {
          const delta = extractResponseTextDelta(event);
          if (delta) {
            fullText += delta;
            runtimeStream.emit('text', delta);
          }
          if (isRecord(event) && event.type === 'response.completed') {
            finalResponse = event.response;
          }
        }
        return responseToMessage(finalResponse, fullText);
      });
    }
  };
}

export function createProviderRuntime(provider: AiProvider, baseURL: string): ProviderRuntime {
  const normalizedBaseURL = normalizeProviderBaseURL(provider.kind, baseURL);
  if (provider.kind === 'openai') {
    return createOpenAIRuntime({
      apiKey: provider.apiKey,
      baseURL: normalizedBaseURL,
      protocol: 'chat'
    });
  }
  if (provider.kind === 'openai-compatible') {
    return createOpenAIRuntime({
      apiKey: provider.apiKey,
      baseURL: normalizedBaseURL,
      protocol: 'responses'
    });
  }
  if (provider.kind === 'gemini') {
    return createOpenAIRuntime({
      apiKey: provider.apiKey,
      baseURL: normalizedBaseURL,
      protocol: 'chat'
    });
  }
  const client = new MessagesClient({
    baseURL: normalizedBaseURL,
    apiKey: provider.apiKey,
    dangerouslyAllowBrowser: true
  });
  return createAnthropicRuntime(client);
}
