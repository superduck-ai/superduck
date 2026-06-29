import type { MutableRefObject } from 'react';
import { trackEvent } from '../../../mcpRuntime';
import { getErrorMessage } from '../../conversation/messageProcessing';
import { createStreamingTextStore } from '../../sidepanelGuards';
import type { ChatMessage } from '../../types';
import type { RafState } from './streamAndProcess';

export interface RetryState {
  count: number;
}

export interface HandleStreamErrorParams {
  error: unknown;
  retryState: RetryState;
  maxRetries: number;
  rafState: RafState;
  streamingTextStoreRef: MutableRefObject<ReturnType<typeof createStreamingTextStore>>;
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
}

export async function handleStreamError(
  params: HandleStreamErrorParams
): Promise<{ shouldRetry: boolean }> {
  const message = getErrorMessage(params.error);
  const lowerMessage = message.toLowerCase();

  if (
    params.retryState.count < params.maxRetries &&
    (lowerMessage.startsWith('overloaded') ||
      lowerMessage.startsWith('internal server error') ||
      lowerMessage.includes('network error') ||
      lowerMessage.includes('connection error') ||
      lowerMessage.includes('failed to fetch') ||
      lowerMessage.startsWith('499') ||
      lowerMessage.includes('this request would exceed the rate limit'))
  ) {
    params.retryState.count++;
    let delay = Math.pow(2, params.retryState.count);
    delay += Math.random() * delay;
    void trackEvent('superduck.sidebar.api_retried', {
      attempt: params.retryState.count,
      error_type: lowerMessage.startsWith('overloaded')
        ? 'overloaded'
        : lowerMessage.includes('rate limit')
          ? 'rate_limit'
          : 'network',
      delay_ms: Math.round(delay * 1000)
    });
    await new Promise((resolve) => setTimeout(resolve, delay * 1000));
    if (params.rafState.rafId !== null) {
      cancelAnimationFrame(params.rafState.rafId);
      params.rafState.rafId = null;
      params.rafState.pending = false;
    }
    params.streamingTextStoreRef.current.set('');
    params.setMessages((prev) => {
      const lastIndex = prev.length - 1;
      if (lastIndex >= 0 && prev[lastIndex].role === 'assistant') {
        return prev.slice(0, lastIndex);
      }
      return prev;
    });
    return { shouldRetry: true };
  }

  return { shouldRetry: false };
}
