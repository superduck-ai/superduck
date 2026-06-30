import { isDebugMsgs } from '../useSidepanelDebug';
import type { MutableRefObject } from 'react';
import { dispatchMessagesClient } from '../../../utils/providerClient';
import { MessagesClient } from '../../../mcpServersStore';
import {
  MAX_TOKENS,
  calculateMessageLimitFromUsage,
  parseMessageLimit,
  parseRateLimitHeaders,
  shouldUpdateMessageLimit,
  type MessageLimitState
} from '../../conversation/messageLimits';
import { prepareMessagesForApi } from '../../conversation/messageProcessing';
import { resolveShortcutMarkersInMessages } from '../../shortcutsMenu/shortcutMarkers';
import { extractTextFromContent } from '../../session/history';
import { getStreamHeaders } from '../../sidepanelGuards';
import { manageScreenshotHistory } from '../../lightningMode/commands';
import type { ApiConversationMessage } from '../../../messageTypes';
import { isToolUseContentBlock } from '../../../messageTypes';
import type { ToolProviderSchema } from '../../../mcpRuntime/pageToolsSupport/types';
import type { ChatMessage, ResponseWithMessageLimit } from '../../types';

export interface RafState {
  rafId: number | null;
  pending: boolean;
}

type SystemPrompt = string | Array<{ type: string; text: string; cache_control?: unknown }>;

export interface StreamAndProcessParams {
  workingMessages: ApiConversationMessage[];
  systemPrompt: SystemPrompt;
  selectedModel: string;
  effectiveMessagesClient: InstanceType<typeof MessagesClient>;
  toolSchemas: ToolProviderSchema[];
  controller: AbortController;
  rafState: RafState;
  serverContextLengthRef: MutableRefObject<number | undefined>;
  executionTabId: number | undefined;
  updateLastAssistantMessage: (text: string) => void;
  flushStreamingText: () => void;
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setApiMessages: (messages: ApiConversationMessage[]) => void;
  setLastStopReason: (reason: { reason: string; messageId?: string }) => void;
  setMessageLimit: (
    limit: MessageLimitState | ((prev: MessageLimitState) => MessageLimitState)
  ) => void;
  setMessageLimitDismissed: (dismissed: boolean) => void;
  sendCompletionNotification: (tabId?: number, answerText?: string) => Promise<void>;
}

export async function streamAndProcess(params: StreamAndProcessParams) {
  let { workingMessages } = params;
  let accumulatedText = '';

  const preparedMessagesRaw = prepareMessagesForApi(workingMessages);
  const preparedMessagesPruned = manageScreenshotHistory(preparedMessagesRaw, 2);
  const preparedMessages = await resolveShortcutMarkersInMessages(preparedMessagesPruned);

  let preparedTools = params.toolSchemas.length ? [...params.toolSchemas] : undefined;
  if (preparedTools && preparedTools.length > 0) {
    const lastToolIndex = preparedTools.length - 1;
    preparedTools = preparedTools.map((t, idx) =>
      idx === lastToolIndex ? { ...t, cache_control: { type: 'ephemeral' } } : t
    );
  }

  const dispatched = await dispatchMessagesClient(
    params.selectedModel,
    params.effectiveMessagesClient
  );

  if (isDebugMsgs()) {
    console.log(
      '[SD_DEBUG] streamAndProcess preparedMessages:',
      preparedMessages.length,
      JSON.stringify(preparedMessages.map((m) => m.role)),
      'tools:',
      preparedTools?.length ?? 0,
      'model:',
      dispatched.modelId
    );
  }

  const stream = dispatched.runtime.stream(
    {
      model: dispatched.modelId,
      max_tokens: MAX_TOKENS,
      system: params.systemPrompt,
      messages: preparedMessages,
      tools: preparedTools
    },
    { signal: params.controller.signal }
  );

  stream.on('connect', () => {
    const headersFromStream = getStreamHeaders(stream);
    if (headersFromStream) {
      const headers: Record<string, string> = {};
      headersFromStream.forEach((value, name) => {
        if (name.startsWith('anthropic-ratelimit-')) {
          headers[name] = value;
        }
      });
      if (Object.keys(headers).length > 0) {
        const parsed = parseRateLimitHeaders(headers);
        if (parsed) {
          params.setMessageLimit((prev) => {
            if (shouldUpdateMessageLimit(prev, parsed)) return parsed;
            return prev;
          });
        }
      }
    }
  });

  stream.on('text', (delta: string) => {
    accumulatedText += delta;
    if (!params.rafState.pending) {
      params.rafState.pending = true;
      params.rafState.rafId = requestAnimationFrame(() => {
        params.rafState.pending = false;
        params.rafState.rafId = null;
        params.updateLastAssistantMessage(accumulatedText);
      });
    }
  });

  const response: ResponseWithMessageLimit = await stream.finalMessage();

  if (isDebugMsgs()) {
    const blockTypes = Array.isArray(response.content)
      ? response.content.map((b: { type?: string }) => b?.type)
      : [];
    console.log(
      '[SD_DEBUG] streamAndProcess finalMessage stop_reason:',
      response.stop_reason,
      'blocks:',
      JSON.stringify(blockTypes),
      'usage:',
      JSON.stringify(response.usage)
    );
  }

  if (params.rafState.rafId !== null) {
    cancelAnimationFrame(params.rafState.rafId);
    params.rafState.rafId = null;
    params.rafState.pending = false;
  }
  if (accumulatedText) {
    params.updateLastAssistantMessage(accumulatedText);
  }

  const assistantContent = Array.isArray(response.content) ? response.content : [];
  const finalText = extractTextFromContent(assistantContent);
  if (finalText) {
    params.updateLastAssistantMessage(finalText);
  }
  params.flushStreamingText();
  if (!finalText) {
    params.setMessages((prev) => {
      const lastIndex = prev.length - 1;
      if (lastIndex >= 0 && prev[lastIndex].role === 'assistant' && !prev[lastIndex].text.trim()) {
        return prev.slice(0, lastIndex);
      }
      return prev;
    });
  }

  const assistantMessage: ApiConversationMessage = {
    role: 'assistant',
    content: assistantContent,
    usage: response.usage,
    id: response.id,
    stop_reason: response.stop_reason
  };
  workingMessages = [...workingMessages, assistantMessage];
  params.setApiMessages(workingMessages);

  params.setLastStopReason({
    reason: response.stop_reason || 'end_turn',
    messageId: response.id
  });
  const parsedMessageLimit = parseMessageLimit(response.message_limit);
  params.setMessageLimit(
    parsedMessageLimit ??
      calculateMessageLimitFromUsage(response.usage || {}, params.serverContextLengthRef.current)
  );
  params.setMessageLimitDismissed(false);

  if (response.stop_reason !== 'tool_use') {
    await params.sendCompletionNotification(params.executionTabId, finalText);
    return {
      workingMessages,
      assistantContent,
      finalText,
      accumulatedText,
      shouldBreak: true,
      toolUses: []
    };
  }

  const toolUses = assistantContent.filter(isToolUseContentBlock);
  if (toolUses.length === 0) {
    return {
      workingMessages,
      assistantContent,
      finalText,
      accumulatedText,
      shouldBreak: true,
      toolUses: []
    };
  }

  return {
    workingMessages,
    assistantContent,
    finalText,
    accumulatedText,
    shouldBreak: false,
    toolUses
  };
}
