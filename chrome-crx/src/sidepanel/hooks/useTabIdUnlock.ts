import { useEffect } from 'react';

export interface UseTabIdUnlockProps {
  effectiveIsAgentRunning: boolean;
  lockedTabIdRef: React.MutableRefObject<number | undefined>;
}

/**
 * useTabIdUnlock — Tab ID 解锁
 * 当 agent 停止运行时解锁 tab ID
 */
export function useTabIdUnlock({ effectiveIsAgentRunning, lockedTabIdRef }: UseTabIdUnlockProps) {
  // Unlock tab ID when agent stops running. The lock is set synchronously
  // in effectiveSendPrompt (not here) to avoid a race condition where the
  // first tool call fires before this effect runs.
  useEffect(() => {
    if (!effectiveIsAgentRunning) {
      lockedTabIdRef.current = undefined;
    }
  }, [effectiveIsAgentRunning, lockedTabIdRef]);
}
