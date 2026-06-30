import { useCallback } from 'react';
import { trackEvent } from '../../mcpRuntime';
import { tabGroupManager } from '../../mcpRuntime';

export interface UseEffectiveCancelProps {
  isPurlMode: boolean;
  lightningResult: any;
  queryTabId: number | undefined;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  setIsAgentRunning: (value: boolean) => void;
  lockedTabIdRef: React.MutableRefObject<number | undefined>;
  iterationCountRef: React.MutableRefObject<number>;
}

/**
 * useEffectiveCancel — 取消操作
 * 在 lightning 模式下路由到 lightningResult.cancel
 */
export function useEffectiveCancel({
  isPurlMode,
  lightningResult,
  queryTabId,
  abortControllerRef,
  setIsAgentRunning,
  lockedTabIdRef,
  iterationCountRef
}: UseEffectiveCancelProps) {
  return useCallback(() => {
    void trackEvent('superduck.sidebar.agent_cancelled', {
      mode: isPurlMode ? 'quick' : 'normal',
      iteration_count: iterationCountRef.current
    });
    if (isPurlMode && lightningResult) {
      lightningResult.cancel();
    } else {
      abortControllerRef.current?.abort();
      setIsAgentRunning(false);
    }
    // Ensure indicators are hidden even if no sendPrompt finally-block fires.
    // Use lockedTabId to target the correct tab (the one agent was running on).
    const cancelTabId = lockedTabIdRef.current ?? queryTabId;
    if (typeof cancelTabId === 'number') {
      chrome.tabs.sendMessage(cancelTabId, { type: 'HIDE_AGENT_INDICATORS' }).catch(() => {});
      tabGroupManager.setTabIndicatorState(cancelTabId, 'none').catch(() => {});
    }
  }, [
    isPurlMode,
    lightningResult,
    queryTabId,
    abortControllerRef,
    setIsAgentRunning,
    lockedTabIdRef,
    iterationCountRef
  ]);
}
