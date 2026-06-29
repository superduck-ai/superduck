import { useCallback, useState } from 'react';

/**
 * useSentinelCallbackRef — Sentinel 元素回调
 * 用于跟踪 sentinel DOM 元素
 */
export function useSentinelCallbackRef() {
  const [sentinelElement, setSentinelElement] = useState<HTMLDivElement | null>(null);
  const sentinelCallbackRef = useCallback((node: HTMLDivElement | null) => {
    setSentinelElement(node);
  }, []);

  return { sentinelElement, sentinelCallbackRef };
}
