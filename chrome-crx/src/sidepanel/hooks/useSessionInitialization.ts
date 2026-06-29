import { useEffect } from 'react';
import { StorageKeys, setStorageValue } from '../../extensionServices';

export interface UseSessionInitializationProps {
  querySessionId: string | undefined;
  queryModel: string | undefined;
  activeSessionId: string;
  setActiveSessionId: (id: string) => void;
  setSelectedModel: (model: string) => void;
}

/**
 * useSessionInitialization — 会话和模型初始化
 * 封装 query 参数初始化逻辑
 */
export function useSessionInitialization({
  querySessionId,
  queryModel,
  activeSessionId,
  setActiveSessionId,
  setSelectedModel
}: UseSessionInitializationProps) {
  // Initialize with query.sessionId on mount (fixes chat history loss on panel reopen).
  useEffect(() => {
    if (querySessionId && !activeSessionId) {
      setActiveSessionId(querySessionId);
    }
  }, [querySessionId, activeSessionId, setActiveSessionId]);

  // A scheduled task may pass a preferred model via the `?model=` query param
  // (a provider id). Seed it into the selected model on mount so the spawned
  // panel dispatches to that provider.
  useEffect(() => {
    if (!queryModel) return;
    setSelectedModel(queryModel);
    void setStorageValue(StorageKeys.SELECTED_MODEL, queryModel);
  }, [queryModel, setSelectedModel]);
}
