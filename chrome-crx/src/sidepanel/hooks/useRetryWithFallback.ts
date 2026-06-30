import { useCallback } from 'react';
import type { SendPromptOptions } from '../types';

export interface UseRetryWithFallbackProps {
  lastSentPayloadRef: React.MutableRefObject<{
    text: string;
    attachments?: any[];
    isAnnotated?: boolean;
  } | null>;
  effectiveSendPrompt: (prompt: string, options?: SendPromptOptions) => Promise<void>;
}

/**
 * useRetryWithFallback — 重试
 * 重新发送最后发送的消息
 */
export function useRetryWithFallback({
  lastSentPayloadRef,
  effectiveSendPrompt
}: UseRetryWithFallbackProps) {
  return useCallback(async () => {
    // Fallback chain is a feature-flag-driven concept that no longer applies
    // (tier abstraction removed; each provider is its own model). Kept as a
    // no-op stub so existing UI/wiring that references it remains stable.
    const payload = lastSentPayloadRef.current;
    if (!payload) return;
    void effectiveSendPrompt(payload.text, {
      attachments: payload.attachments,
      isAnnotated: payload.isAnnotated
    });
  }, [effectiveSendPrompt, lastSentPayloadRef]);
}
