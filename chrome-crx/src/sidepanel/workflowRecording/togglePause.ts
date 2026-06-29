import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { elementSelectorInjector } from '../elementSelectorInjector';
import { normalizeCapturedEvent } from './normalizeCapturedEvent';
import type { CapturedEvent, RecordingState } from './types';

export interface TogglePauseParams {
  isPaused: boolean;
  activeTabs: Set<number>;
  currentTabId: number | undefined;
  tabId: number;
  isSpeechRecording: boolean;
  injectionPendingTabsRef: MutableRefObject<Set<number>>;
  speechWasRecordingBeforePauseRef: MutableRefObject<boolean>;
  setRecordingState: Dispatch<SetStateAction<RecordingState>>;
  handleCapturedEvent: (event: CapturedEvent) => Promise<void>;
  startSpeechRecording: () => Promise<unknown>;
  stopSpeechRecording: () => void;
}

export function workflowTogglePause(params: TogglePauseParams): void {
  const {
    isPaused,
    activeTabs,
    currentTabId,
    tabId,
    isSpeechRecording,
    injectionPendingTabsRef,
    speechWasRecordingBeforePauseRef,
    setRecordingState,
    handleCapturedEvent,
    startSpeechRecording,
    stopSpeechRecording
  } = params;

  const wasPaused = isPaused;

  setRecordingState((prev) => ({ ...prev, isPaused: !prev.isPaused }));

  if (wasPaused) {
    const activeTabId = currentTabId || tabId;
    if (activeTabId && !injectionPendingTabsRef.current.has(activeTabId)) {
      injectionPendingTabsRef.current.add(activeTabId);
      elementSelectorInjector
        .injectElementSelector(activeTabId)
        .then((result) => {
          injectionPendingTabsRef.current.delete(activeTabId);
          if (result) {
            handleCapturedEvent(normalizeCapturedEvent(result));
          }
        })
        .catch(() => {
          injectionPendingTabsRef.current.delete(activeTabId);
        });
    }
    if (speechWasRecordingBeforePauseRef.current && !isSpeechRecording) {
      startSpeechRecording();
    }
  } else {
    injectionPendingTabsRef.current.clear();
    if (activeTabs.size > 0) {
      activeTabs.forEach((tid) => {
        chrome.tabs.sendMessage(tid, { type: 'CANCEL_ELEMENT_SELECTOR' }).catch(() => {});
      });
    }
    speechWasRecordingBeforePauseRef.current = isSpeechRecording;
    if (isSpeechRecording) {
      stopSpeechRecording();
    }
  }
}
