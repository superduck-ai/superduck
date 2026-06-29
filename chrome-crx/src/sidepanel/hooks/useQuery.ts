import { useMemo } from 'react';
import { useQueryState, useActiveTabId } from './useTabState';

/**
 * useQuery — 查询参数
 * 合并 useQueryState 和 dynamicTabId
 */
export function useQuery() {
  const _query = useQueryState();
  const dynamicTabId = useActiveTabId(_query.tabId);

  return useMemo(
    () => ({ ..._query, tabId: dynamicTabId ?? _query.tabId }),
    [_query, dynamicTabId]
  );
}
