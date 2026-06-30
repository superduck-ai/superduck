import type { MutableRefObject } from 'react';
import { ConversationCompactor } from '../../conversation/conversationCompaction';
import { MAX_TOKENS, calculateMessageLimitFromUsage } from '../../conversation/messageLimits';
import type {
  ApiConversationMessage,
  ApiResponseMessage,
  CreateApiMessageParams
} from '../../../messageTypes';
import type { ChatRole, VisibleChatRole } from '../../types';

export interface CompactInLoopParams {
  workingMessages: ApiConversationMessage[];
  serverContextLengthRef: MutableRefObject<number | undefined>;
  createApiMessage: (params: CreateApiMessageParams) => Promise<ApiResponseMessage>;
  locale: string;
  setApiMessages: (messages: ApiConversationMessage[]) => void;
  pushMessage: (role: ChatRole | VisibleChatRole, text: string) => void;
}

export async function compactInLoop(
  params: CompactInLoopParams
): Promise<{ workingMessages: ApiConversationMessage[] }> {
  let { workingMessages } = params;

  const lastAssistantMsg = [...workingMessages]
    .reverse()
    .find((m): m is ApiConversationMessage => m.role === 'assistant' && !!m.usage);
  if (lastAssistantMsg?.usage) {
    const limitState = calculateMessageLimitFromUsage(
      lastAssistantMsg.usage,
      params.serverContextLengthRef.current
    );
    if (limitState.type === 'exceeded_limit' || limitState.type === 'approaching_limit') {
      try {
        const compactor = new ConversationCompactor(
          async (p: CreateApiMessageParams) => params.createApiMessage(p),
          params.locale,
          params.serverContextLengthRef.current
        );
        const compactResult = await compactor.compactConversation(
          workingMessages,
          MAX_TOKENS,
          true
        );
        workingMessages = compactResult.messagesAfterCompacting;
        params.setApiMessages(workingMessages);
        params.pushMessage('system', 'Conversation compacted to save context.');
      } catch (compactError) {
        console.warn('[Agentic Loop] In-loop compaction failed:', compactError);
      }
    }
  }

  return { workingMessages };
}
