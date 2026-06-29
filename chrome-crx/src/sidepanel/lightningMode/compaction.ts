import type { ApiResponseMessage } from '../../messageTypes';
import { ConversationCompactor } from '../conversation/conversationCompaction';
import { calculateMessageLimitFromUsage, MAX_TOKENS } from '../conversation/messageLimits';
import type { LightningCreateApiMessageParams } from '../types';
import { filterSyntheticMessages, type LightningMessage } from './commands';

export async function compactLightningMessagesIfNeeded({
  messages,
  createApiMessage,
  locale,
  resolveContextWindow,
  setIsCompacting
}: {
  messages: LightningMessage[];
  createApiMessage: (params: LightningCreateApiMessageParams) => Promise<ApiResponseMessage>;
  locale?: string;
  resolveContextWindow: () => Promise<number>;
  setIsCompacting: (value: boolean) => void;
}): Promise<LightningMessage[]> {
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.usage);
  if (!lastAssistant?.usage) return messages;

  const contextWindow = await resolveContextWindow();
  const limitState = calculateMessageLimitFromUsage(lastAssistant.usage, contextWindow);
  if (limitState.type === 'within_limit') return messages;

  setIsCompacting(true);
  try {
    const compactor = new ConversationCompactor(
      async (params) =>
        createApiMessage({
          model: params.model,
          maxTokens: params.maxTokens ?? params.max_tokens ?? MAX_TOKENS,
          messages: params.messages as LightningMessage[],
          system: (params.system ?? '') as LightningCreateApiMessageParams['system']
        }),
      locale,
      contextWindow
    );
    const compactInput = filterSyntheticMessages(messages);
    const result = await compactor.compactConversation(compactInput, MAX_TOKENS, true);
    return result.messagesAfterCompacting as LightningMessage[];
  } catch (error) {
    console.warn('[Lightning] Conversation compaction failed:', error);
    return messages;
  } finally {
    setIsCompacting(false);
  }
}
