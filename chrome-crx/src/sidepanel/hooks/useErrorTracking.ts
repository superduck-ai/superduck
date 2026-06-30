import { useEffect } from 'react';
import { trackEvent } from '../../mcpRuntime';

export interface UseErrorTrackingProps {
  effectiveRuntimeError: string | null;
  isPurlMode: boolean;
  lightningResultError: string | null | undefined;
}

/**
 * useErrorTracking — 错误跟踪
 * 跟踪错误显示事件
 */
export function useErrorTracking({
  effectiveRuntimeError,
  isPurlMode,
  lightningResultError
}: UseErrorTrackingProps) {
  useEffect(() => {
    const msg = effectiveRuntimeError;
    if (!msg) return;
    void trackEvent('superduck.sidebar.error_shown', {
      // Truncate to keep PostHog cardinality bounded and avoid leaking user content.
      message: msg.slice(0, 80),
      source: isPurlMode && lightningResultError ? 'chat' : 'runtime'
    });
  }, [effectiveRuntimeError, isPurlMode, lightningResultError]);
}
