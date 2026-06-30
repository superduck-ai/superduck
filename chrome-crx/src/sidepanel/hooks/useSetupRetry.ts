import { useCallback } from 'react';

export interface UseSetupRetryProps {
  refreshAuth: () => Promise<void>;
  refreshProviderConfig: () => void;
}

/**
 * useSetupRetry — 设置重试
 * 刷新认证和 provider 配置
 */
export function useSetupRetry({ refreshAuth, refreshProviderConfig }: UseSetupRetryProps) {
  return useCallback(async () => {
    await refreshAuth();
    refreshProviderConfig();
  }, [refreshAuth, refreshProviderConfig]);
}
