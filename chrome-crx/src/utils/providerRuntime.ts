import OpenAI from 'openai';
import { MessagesClient } from '../mcpServersStore';
import type { ApiResponseMessage, ApiToolUseBlock } from '../messageTypes';
import { isRecord } from '../messageTypes';
import { DEFAULT_BASE_URL, normalizeProviderBaseURL, type AiProvider } from './providerStore';
import {
  chatCompletionToMessage,
  extractResponseTextDelta,
  getNumber,
  getString,
  normalizeSystemText,
  responseToMessage,
  safeParseJSON,
  toOpenAIChatMessages,
  toOpenAIChatTools,
  toOpenAIResponsesInput,
  toOpenAIResponsesTools
} from './openaiAdapter';

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
