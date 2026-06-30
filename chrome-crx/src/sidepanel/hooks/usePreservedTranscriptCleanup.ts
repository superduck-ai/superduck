import { useEffect } from 'react';

export interface UsePreservedTranscriptCleanupProps {
  dynamicTabId: number | undefined;
  screenshotActivationTabIdsRef: React.MutableRefObject<Set<number>>;
  preservedTranscriptTabId: number | undefined;
  preservedTranscriptActiveTabId: number | undefined;
  setPreservedTranscriptTabId: (tabId: number | undefined) => void;
  setPreservedTranscriptActiveTabId: (tabId: number | undefined) => void;
}

/**
 * usePreservedTranscriptCleanup — Preserved Transcript 清理
 * 清理 preserved transcript 状态
 */
export function usePreservedTranscriptCleanup({
  dynamicTabId,
  screenshotActivationTabIdsRef,
  preservedTranscriptTabId,
  preservedTranscriptActiveTabId,
  setPreservedTranscriptTabId,
  setPreservedTranscriptActiveTabId
}: UsePreservedTranscriptCleanupProps) {
  useEffect(() => {
    if (
      typeof dynamicTabId === 'number' &&
      screenshotActivationTabIdsRef.current.has(dynamicTabId)
    ) {
      return;
    }
    if (
      typeof preservedTranscriptTabId === 'number' &&
      typeof preservedTranscriptActiveTabId === 'number' &&
      typeof dynamicTabId === 'number' &&
      dynamicTabId !== preservedTranscriptActiveTabId
    ) {
      setPreservedTranscriptTabId(undefined);
      setPreservedTranscriptActiveTabId(undefined);
    }
  }, [
    dynamicTabId,
    preservedTranscriptActiveTabId,
    preservedTranscriptTabId,
    screenshotActivationTabIdsRef,
    setPreservedTranscriptTabId,
    setPreservedTranscriptActiveTabId
  ]);
}
