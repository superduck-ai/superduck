import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
  BetaToolUseBlockParam,
  BetaUsage,
  MessageCreateParamsNonStreaming
} from '@anthropic-ai/sdk/resources/beta/messages/messages';

export type ApiInputContentBlock = BetaContentBlockParam;
export type ApiToolUseBlock = BetaToolUseBlock | BetaToolUseBlockParam;
export type ApiToolResultBlock = BetaToolResultBlockParam;
export type ApiUsage = BetaUsage;
export type ApiStopReason = BetaMessage['stop_reason'];

export interface ApiConversationMessage extends BetaMessageParam {
  id?: string;
  usage?: ApiUsage;
  stop_reason?: ApiStopReason;
  isLocalOnlyMessage?: boolean;
  isCompactionMessage?: boolean;
  isCompactSummary?: boolean;
}

export interface CreateApiMessageParams
  extends Omit<MessageCreateParamsNonStreaming, 'max_tokens' | 'messages' | 'model'> {
  maxTokens?: number;
  max_tokens?: number;
  modelClass?: 'small_fast';
  model?: string;
  messages: ApiConversationMessage[];
}

export type ApiResponseMessage = BetaMessage;
export type ApiMessageContent = ApiConversationMessage['content'];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isTextContentBlock(
  block: unknown
): block is Extract<ApiInputContentBlock, { type: 'text' }> {
  return isRecord(block) && block.type === 'text' && typeof block.text === 'string';
}

export function isToolUseContentBlock(block: unknown): block is ApiToolUseBlock {
  return (
    isRecord(block) &&
    block.type === 'tool_use' &&
    typeof block.id === 'string' &&
    typeof block.name === 'string'
  );
}

export function isToolResultContentBlock(block: unknown): block is ApiToolResultBlock {
  return isRecord(block) && block.type === 'tool_result' && typeof block.tool_use_id === 'string';
}
