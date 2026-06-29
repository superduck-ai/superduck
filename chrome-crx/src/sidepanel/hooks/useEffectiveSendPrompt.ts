import { useCallback } from 'react';
import type { SendPromptOptions } from '../types';

export interface UseEffectiveSendPromptProps {
  isPurlMode: boolean;
  lightningResult: any;
  preservedTranscriptTabId: number | undefined;
  queryTabId: number | undefined;
  sendPrompt: (prompt: string, options?: SendPromptOptions) => Promise<void>;
  lockedTabIdRef: React.MutableRefObject<number | undefined>;
  agentStartedTabIdRef: React.MutableRefObject<number | undefined>;
  tabChangedDuringAgentRef: React.MutableRefObject<boolean>;
  isAgentRunningRef: React.MutableRefObject<boolean>;
}

/**
 * useEffectiveSendPrompt — 发送提示
 * 在 lightning 模式下路由到 lightningResult.sendMessage
 */
export function useEffectiveSendPrompt({
  isPurlMode,
  lightningResult,
  preservedTranscriptTabId,
  queryTabId,
  sendPrompt,
  lockedTabIdRef,
  agentStartedTabIdRef,
  tabChangedDuringAgentRef,
  isAgentRunningRef
}: UseEffectiveSendPromptProps) {
  return useCallback(
    async (text: string, options?: SendPromptOptions) => {
      const targetTabId = options?.targetTabId ?? preservedTranscriptTabId ?? queryTabId;
      // Lock tab ID synchronously BEFORE starting the agent, so that tool calls
      // always target the tab the user was on when they sent the message.
      // Using useEffect for this creates a race condition where the first tool
      // call could fire before the effect runs.
      if (typeof targetTabId === 'number') {
        lockedTabIdRef.current = targetTabId;
        agentStartedTabIdRef.current = targetTabId;
        tabChangedDuringAgentRef.current = false;
      }
      try {
        if (isPurlMode && lightningResult) {
          return await lightningResult.sendMessage(text, options?.attachments, null, false);
        }
        return await sendPrompt(text, { ...options, targetTabId });
      } finally {
        // If neither the normal agent nor the lightning mode actually
        // transitioned into a "running" state (e.g. sendPrompt hit an
        // early-return for /compact, /share, empty input, or missing
        // client; or lightningResult.sendMessage returned before
        // setting lnIsLoading), the unlock effect would never fire and
        // `lockedTabIdRef` would stay set forever. Clear it ourselves
        // in that case so future calls are not bound to a stale tab.
        const stillRunning = isPurlMode
          ? Boolean(lightningResult?.isLoading)
          : isAgentRunningRef.current;
        if (!stillRunning) {
          lockedTabIdRef.current = undefined;
        }
      }
    },
    [
      isPurlMode,
      lightningResult,
      preservedTranscriptTabId,
      queryTabId,
      sendPrompt,
      lockedTabIdRef,
      agentStartedTabIdRef,
      tabChangedDuringAgentRef,
      isAgentRunningRef
    ]
  );
}
