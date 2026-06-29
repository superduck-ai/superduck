import { useCallback } from 'react';

export interface UseEffectiveClearErrorProps {
  isPurlMode: boolean;
  lightningResult: any;
  setRuntimeError: (error: string | null) => void;
}

/**
 * useEffectiveClearError — 清除错误
 * 在 lightning 模式下路由到 lightningResult.clearError
 */
export function useEffectiveClearError({
  isPurlMode,
  lightningResult,
  setRuntimeError
}: UseEffectiveClearErrorProps) {
  return useCallback(() => {
    if (isPurlMode && lightningResult) {
      lightningResult.clearError();
    }
    setRuntimeError(null);
  }, [isPurlMode, lightningResult, setRuntimeError]);
}
