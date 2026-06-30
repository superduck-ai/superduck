import { useEffect } from 'react';
import { setStorageValue } from '../../extensionServices';
import { LAST_ACTIVE_SESSION_KEY } from '../sidepanelGuards';

export interface UseLastActiveSessionProps {
  activeSessionId: string;
}

/**
 * useLastActiveSession — 最后活跃 Session 持久化
 * 保存 activeSessionId 到 storage，用于跨 tab 恢复
 */
export function useLastActiveSession({ activeSessionId }: UseLastActiveSessionProps) {
  useEffect(() => {
    if (!activeSessionId) return;
    void setStorageValue(LAST_ACTIVE_SESSION_KEY, activeSessionId);
  }, [activeSessionId]);
}
