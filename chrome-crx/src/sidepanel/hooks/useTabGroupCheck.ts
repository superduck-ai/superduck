import { useEffect } from 'react';

export interface UseTabGroupCheckProps {
  ensureCurrentTabIsMainInGroup: () => Promise<void>;
  refreshBlockedState: () => Promise<void>;
}

/**
 * useTabGroupCheck — Tab Group 检查
 * 确保当前 tab 是 group 中的主 tab，并刷新阻止状态
 */
export function useTabGroupCheck({
  ensureCurrentTabIsMainInGroup,
  refreshBlockedState
}: UseTabGroupCheckProps) {
  useEffect(() => {
    void ensureCurrentTabIsMainInGroup();
    void refreshBlockedState();
  }, [ensureCurrentTabIsMainInGroup, refreshBlockedState]);
}
