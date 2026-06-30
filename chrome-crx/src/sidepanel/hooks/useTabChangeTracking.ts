import { useEffect } from 'react';

export interface UseTabChangeTrackingProps {
  effectiveIsAgentRunning: boolean;
  agentStartedTabIdRef: React.MutableRefObject<number | undefined>;
  dynamicTabId: number | undefined;
  tabChangedDuringAgentRef: React.MutableRefObject<boolean>;
}

/**
 * useTabChangeTracking — Tab 变化跟踪
 * 跟踪 agent 运行期间 tab 是否变化
 */
export function useTabChangeTracking({
  effectiveIsAgentRunning,
  agentStartedTabIdRef,
  dynamicTabId,
  tabChangedDuringAgentRef
}: UseTabChangeTrackingProps) {
  useEffect(() => {
    if (
      effectiveIsAgentRunning &&
      typeof agentStartedTabIdRef.current === 'number' &&
      typeof dynamicTabId === 'number' &&
      dynamicTabId !== agentStartedTabIdRef.current
    ) {
      tabChangedDuringAgentRef.current = true;
    }
  }, [dynamicTabId, effectiveIsAgentRunning, agentStartedTabIdRef, tabChangedDuringAgentRef]);
}
