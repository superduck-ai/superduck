import { useCallback } from 'react';
import { getStorageValue, setStorageValue } from '../../extensionServices';
import { getTabSessionKey } from '../sidepanelGuards';

export interface UseClearPreservedTranscriptProps {
  preservedTranscriptTabId: number | undefined;
  dynamicTabId: number | undefined;
  activeSessionId: string;
  setPreservedTranscriptTabId: (tabId: number | undefined) => void;
  setPreservedTranscriptActiveTabId: (tabId: number | undefined) => void;
  setActiveConversationUuid: (uuid: string | null) => void;
  setActiveRemoteSessionId: (id: string | null) => void;
  setActiveSessionId: (id: string) => void;
  sessionResolvedForTabRef: React.MutableRefObject<number | undefined>;
  hasLoadedSessionRef: React.MutableRefObject<boolean>;
  sessionCreatedAtRef: React.MutableRefObject<number>;
}

/**
 * useClearPreservedTranscript — 清除保留的转录
 * 当目标 tab 改变时清除保留的转录状态
 */
export function useClearPreservedTranscript({
  preservedTranscriptTabId,
  dynamicTabId,
  activeSessionId,
  setPreservedTranscriptTabId,
  setPreservedTranscriptActiveTabId,
  setActiveConversationUuid,
  setActiveRemoteSessionId,
  setActiveSessionId,
  sessionResolvedForTabRef,
  hasLoadedSessionRef,
  sessionCreatedAtRef
}: UseClearPreservedTranscriptProps) {
  return useCallback(
    async (targetTabId: number | undefined): Promise<string | null> => {
      if (
        typeof targetTabId !== 'number' ||
        typeof preservedTranscriptTabId !== 'number' ||
        targetTabId !== dynamicTabId ||
        targetTabId === preservedTranscriptTabId
      ) {
        return null;
      }
      const storedSessionId = await getStorageValue(getTabSessionKey(targetTabId));
      const nextSessionId =
        typeof storedSessionId === 'string' && storedSessionId
          ? storedSessionId
          : crypto.randomUUID();
      if (nextSessionId !== storedSessionId) {
        await setStorageValue(getTabSessionKey(targetTabId), nextSessionId);
      }
      sessionResolvedForTabRef.current = targetTabId;
      setPreservedTranscriptTabId(undefined);
      setPreservedTranscriptActiveTabId(undefined);
      if (nextSessionId !== activeSessionId) {
        hasLoadedSessionRef.current = false;
        setActiveConversationUuid(null);
        setActiveRemoteSessionId(null);
        sessionCreatedAtRef.current = Date.now();
        setActiveSessionId(nextSessionId);
      }
      return nextSessionId;
    },
    [
      activeSessionId,
      dynamicTabId,
      preservedTranscriptTabId,
      setPreservedTranscriptTabId,
      setPreservedTranscriptActiveTabId,
      setActiveConversationUuid,
      setActiveRemoteSessionId,
      setActiveSessionId,
      sessionResolvedForTabRef,
      hasLoadedSessionRef,
      sessionCreatedAtRef
    ]
  );
}
