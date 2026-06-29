import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { RecordingState, WorkflowStep } from './types';

export interface StopRecordingParams {
  recordingState: RecordingState;
  activeTabs: Set<number>;
  isSpeechRecording: boolean;
  isRecordingRef: MutableRefObject<boolean>;
  tabActivationListenerRef: MutableRefObject<
    ((activeInfo: chrome.tabs.OnActivatedInfo) => void) | null
  >;
  injectionPendingTabsRef: MutableRefObject<Set<number>>;
  visitedTabsRef: MutableRefObject<Set<number>>;
  createdTabsRef: MutableRefObject<Set<number>>;
  tabGroupIdRef: MutableRefObject<number | undefined>;
  setRecordingState: Dispatch<SetStateAction<RecordingState>>;
  setCurrentTabId: Dispatch<SetStateAction<number | undefined>>;
  setActiveTabs: Dispatch<SetStateAction<Set<number>>>;
  stopSpeechRecording: () => void;
  onComplete?: (steps: WorkflowStep[]) => void;
}

export function workflowStopRecording(params: StopRecordingParams): void {
  const {
    recordingState,
    activeTabs,
    isSpeechRecording,
    isRecordingRef,
    tabActivationListenerRef,
    injectionPendingTabsRef,
    visitedTabsRef,
    createdTabsRef,
    tabGroupIdRef,
    setRecordingState,
    setCurrentTabId,
    setActiveTabs,
    stopSpeechRecording,
    onComplete
  } = params;

  setRecordingState((prev) => ({
    ...prev,
    steps: prev.steps.map((step) =>
      step.action === 'type' && step.isPending ? { ...step, isPending: false } : step
    )
  }));

  const { steps } = recordingState;

  isRecordingRef.current = false;

  if (isSpeechRecording) {
    stopSpeechRecording();
  }

  if (tabActivationListenerRef.current) {
    chrome.tabs.onActivated.removeListener(tabActivationListenerRef.current);
    tabActivationListenerRef.current = null;
  }

  if (activeTabs.size > 0) {
    activeTabs.forEach((tid) => {
      chrome.tabs.sendMessage(tid, { type: 'CANCEL_ELEMENT_SELECTOR' }).catch(() => {});
    });
    setActiveTabs(new Set());
  }

  setCurrentTabId(undefined);
  tabGroupIdRef.current = undefined;
  injectionPendingTabsRef.current.clear();
  visitedTabsRef.current.clear();
  createdTabsRef.current.clear();

  setRecordingState({
    isRecording: false,
    isPaused: false,
    steps: [],
    startTime: null
  });

  if (steps.length > 0 && onComplete) {
    onComplete(steps);
  }
}
