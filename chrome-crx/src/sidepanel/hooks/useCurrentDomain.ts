import { useMemo } from 'react';

export interface UseCurrentDomainProps {
  currentPageUrl: string;
}

/**
 * useCurrentDomain — 当前域名
 * 从 currentPageUrl 提取域名
 */
export function useCurrentDomain({ currentPageUrl }: UseCurrentDomainProps) {
  return useMemo(() => {
    try {
      return currentPageUrl ? new URL(currentPageUrl).hostname : null;
    } catch {
      return null;
    }
  }, [currentPageUrl]);
}
