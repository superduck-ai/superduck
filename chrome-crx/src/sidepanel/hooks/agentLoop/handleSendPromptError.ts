import type { MutableRefObject } from 'react';
import { trackEvent } from '../../../mcpRuntime';
import { getErrorMessage } from '../../conversation/messageProcessing';
import { parseRateLimitFromError, type MessageLimitState } from '../../conversation/messageLimits';
import type { ChatRole, VisibleChatRole } from '../../types';

export interface HandleSendPromptErrorParams {
  error: unknown;
  selectedModelRef: MutableRefObject<string>;
  setMessageLimit: (
    limit: MessageLimitState | ((prev: MessageLimitState) => MessageLimitState)
  ) => void;
  pushMessage: (role: ChatRole | VisibleChatRole, text: string) => void;
  setRuntimeError: (message: string | null) => void;
}

export function handleSendPromptError(params: HandleSendPromptErrorParams): void {
  const message = getErrorMessage(params.error);
  const lowerMessage = message.toLowerCase();
  const rateLimitState = parseRateLimitFromError(params.error);
  if (rateLimitState) {
    params.setMessageLimit(rateLimitState);
  }
  const errorType = lowerMessage.includes('abort')
    ? 'abort'
    : rateLimitState
      ? 'rate_limit'
      : lowerMessage.includes('connection error') ||
          lowerMessage.includes('failed to fetch') ||
          lowerMessage.includes('network error')
        ? 'network'
        : lowerMessage.startsWith('overloaded')
          ? 'overloaded'
          : 'other';
  if (errorType !== 'abort') {
    void trackEvent('superduck.sidebar.api_error', {
      error_type: errorType,
      model: params.selectedModelRef.current || ''
    });
  }
  if (lowerMessage.includes('abort') || lowerMessage === 'request was aborted.') {
    params.pushMessage('system', 'Generation stopped.');
  } else {
    let runtimeMessage = message;
    const isNetworkLikeError =
      lowerMessage.includes('connection error') ||
      lowerMessage.includes('failed to fetch') ||
      lowerMessage.includes('network error');
    if (isNetworkLikeError) {
      runtimeMessage = 'Network error — please check your internet connection and try again.';
    } else if (lowerMessage.startsWith('overloaded')) {
      runtimeMessage = 'Claude is currently overloaded. Please try again in a moment.';
    } else if (rateLimitState) {
      const retryText = rateLimitState.resetsAt
        ? ` Please wait ~${Math.ceil((rateLimitState.resetsAt - Date.now()) / 1000)}s.`
        : '';
      runtimeMessage = `Rate limit reached.${retryText}`;
    }
    params.setRuntimeError(runtimeMessage);
    params.pushMessage('system', `Error: ${runtimeMessage}`);
  }
}
