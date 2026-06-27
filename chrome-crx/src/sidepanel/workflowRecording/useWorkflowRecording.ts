import { useState, useRef, useCallback, useEffect } from 'react';
import { useIntlSafe, type SupportedLocale } from '../../index-react-dom-intl';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useScreenCapture } from '../hooks/useScreenCapture';
import { workflowHandleCapturedEvent } from './handleCapturedEvent';
import { workflowStartRecording } from './startRecording';
import { workflowStopRecording } from './stopRecording';
import { workflowTogglePause } from './togglePause';
import { recordEvent } from '../../debug';
import { useKeystrokeUpdates } from './useKeystrokeUpdates';
import { useTabStatusListeners } from './tabStatusListeners';
import type {
  WorkflowStep,
  RecordingState,
  CapturedEvent,
  UseWorkflowRecordingProps
} from './types';

export const useWorkflowRecording = ({
  tabId,
  onComplete,
  createMessage
}: UseWorkflowRecordingProps) => {
  const intl = useIntlSafe();

  // Recording state
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    steps: [],
    startTime: null
  });

  const [error, setError] = useState<string | null>(null);

  // Tab tracking
  const [activeTabs, setActiveTabs] = useState<Set<number>>(new Set());
  const visitedTabsRef = useRef<Set<number>>(new Set());
  const createdTabsRef = useRef<Set<number>>(new Set());
  const [currentTabId, setCurrentTabId] = useState<number | undefined>(tabId);
  const tabGroupIdRef = useRef<number | undefined>(undefined);

  // Recording control
  const isRecordingRef = useRef(false);
  const isCapturingRef = useRef(false);

  // Screenshot and speech
  const lastScreenshotRef = useRef<string>('');
  const tabActivationListenerRef = useRef<
    ((activeInfo: chrome.tabs.OnActivatedInfo) => void) | null
  >(null);
  const injectionPendingTabsRef = useRef<Set<number>>(new Set());
  const lastSpeechTimestampRef = useRef<number>(0);
  const speechWasRecordingBeforePauseRef = useRef<boolean>(false);

  // Interim transcript
  const [currentInterimTranscript, setCurrentInterimTranscript] = useState<string>('');
  const speechSegmentsRef = useRef<Array<{ text: string; timestamp: number; isFinal: boolean }>>(
    []
  );

  // Deduplication
  const processedEventsRef = useRef<Set<number>>(new Set());
  const lastTabsRef = useRef<Set<number>>(new Set());
  const lastTabIdRef = useRef<number | undefined>(tabId);

  // Speech recognition hook
  const {
    isRecording: isSpeechRecording,
    speechSegments,
    error: speechError,
    isSupported: isSpeechSupported,
    hasPermission: hasSpeechPermission,
    startRecording: startSpeechRecording,
    stopRecording: stopSpeechRecording
  } = useSpeechRecognition(intl.locale);

  // Screen capture hook
  const { captureFullScreen } = useScreenCapture({
    tabId: currentTabId || tabId,
    forceTabActivation: false,
    onCapture: (result) => {
      lastScreenshotRef.current = result.base64 || '';
    }
  });

  // Update speech segments and interim transcript
  useEffect(() => {
    speechSegmentsRef.current = speechSegments;
    const newTranscript = speechSegments
      .filter((seg) => seg.timestamp > lastSpeechTimestampRef.current)
      .map((seg) => seg.text)
      .join(' ')
      .trim();
    setCurrentInterimTranscript(newTranscript);
  }, [speechSegments]);

  useKeystrokeUpdates({
    isRecordingRef,
    isPaused: recordingState.isPaused,
    currentTabId,
    tabId,
    intl,
    setRecordingState
  });

  // Handle captured event (click)
  const handleCapturedEvent = useCallback(
    (event: CapturedEvent) =>
      workflowHandleCapturedEvent({
        event,
        isRecordingRef,
        processedEventsRef,
        lastScreenshotRef,
        lastSpeechTimestampRef,
        speechSegmentsRef,
        injectionPendingTabsRef,
        isPaused: recordingState.isPaused,
        setRecordingState,
        setCurrentInterimTranscript,
        setError,
        captureFullScreen,
        createMessage,
        intl,
        locale: intl.locale as SupportedLocale,
        handleCapturedEvent
      }),
    [recordingState.isPaused, captureFullScreen, createMessage, intl.locale]
  );

  // Start recording
  const startRecording = useCallback(
    (enableVoice?: boolean) => {
      const workflowRecordingId =
        (globalThis.crypto?.randomUUID?.() as string) ?? `wf-${Date.now().toString(36)}`;
      recordEvent({
        domain: 'workflow-recording',
        event: 'workflow.start',
        ids: { workflowRecordingId, tabId },
        data: { enableVoice: !!enableVoice }
      });
      return workflowStartRecording({
        enableVoice,
        tabId,
        isRecordingRef,
        visitedTabsRef,
        createdTabsRef,
        tabGroupIdRef,
        injectionPendingTabsRef,
        tabActivationListenerRef,
        lastSpeechTimestampRef,
        isPaused: recordingState.isPaused,
        activeTabs,
        isSpeechSupported,
        hasSpeechPermission,
        setRecordingState,
        setCurrentTabId,
        setActiveTabs,
        setError,
        startSpeechRecording,
        handleCapturedEvent,
        intl
      });
    },
    [
      tabId,
      handleCapturedEvent,
      recordingState.isPaused,
      activeTabs,
      isSpeechSupported,
      hasSpeechPermission,
      startSpeechRecording
    ]
  );

  // Stop recording
  const stopRecording = useCallback(() => {
    recordEvent({ domain: 'workflow-recording', event: 'workflow.stop', ids: { tabId } });
    return workflowStopRecording({
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
    });
  }, [recordingState, onComplete, activeTabs, isSpeechRecording, stopSpeechRecording]);

  // Toggle pause
  const togglePause = useCallback(() => {
    const willPause = !recordingState.isPaused;
    recordEvent({
      domain: 'workflow-recording',
      event: willPause ? 'workflow.pause' : 'workflow.resume',
      ids: { tabId }
    });
    return workflowTogglePause({
      isPaused: recordingState.isPaused,
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
    });
  }, [
    recordingState.isPaused,
    activeTabs,
    currentTabId,
    tabId,
    handleCapturedEvent,
    isSpeechRecording,
    startSpeechRecording,
    stopSpeechRecording
  ]);

  // Toggle speech recording
  const toggleSpeechRecording = useCallback(async () => {
    if (recordingState.isRecording) {
      if (isSpeechRecording) {
        stopSpeechRecording();
      } else {
        await startSpeechRecording();
      }
    }
  }, [recordingState.isRecording, isSpeechRecording, startSpeechRecording, stopSpeechRecording]);

  // Remove step
  const removeStep = useCallback((index: number) => {
    setRecordingState((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index)
    }));
  }, []);

  const updateStep = useCallback((index: number, updates: Partial<WorkflowStep>) => {
    setRecordingState((prev) => {
      if (index < 0 || index >= prev.steps.length) return prev;

      const nextSteps = [...prev.steps];
      nextSteps[index] = {
        ...nextSteps[index],
        ...updates
      };

      return {
        ...prev,
        steps: nextSteps
      };
    });
  }, []);

  // Reorder steps
  const reorderSteps = useCallback((fromIndex: number, toIndex: number) => {
    setRecordingState((prev) => {
      const newSteps = [...prev.steps];
      const [movedStep] = newSteps.splice(fromIndex, 1);
      newSteps.splice(toIndex, 0, movedStep);
      return { ...prev, steps: newSteps };
    });
  }, []);

  // Clear steps
  const clearSteps = useCallback(() => {
    setRecordingState((prev) => ({ ...prev, steps: [] }));
  }, []);

  // Listen for tab status changes and activation
  useTabStatusListeners({
    currentTabId,
    tabId,
    isPaused: recordingState.isPaused,
    isRecordingRef,
    injectionPendingTabsRef,
    visitedTabsRef,
    setRecordingState,
    handleCapturedEvent,
    intl
  });

  // Cleanup on unmount
  useEffect(() => {
    const cleanup = () => {
      if (isRecordingRef.current) {
        const tabs = lastTabsRef.current;
        if (tabs.size > 0) {
          tabs.forEach((tid) => {
            chrome.tabs.sendMessage(tid, { type: 'CANCEL_ELEMENT_SELECTOR' }).catch(() => {});
          });
        }

        if (tabActivationListenerRef.current) {
          chrome.tabs.onActivated.removeListener(tabActivationListenerRef.current);
          tabActivationListenerRef.current = null;
        }
      }
    };

    window.addEventListener('pagehide', cleanup);
    window.addEventListener('beforeunload', cleanup);

    return () => {
      cleanup();
      window.removeEventListener('pagehide', cleanup);
      window.removeEventListener('beforeunload', cleanup);
    };
  }, []);

  // Update refs for cleanup
  useEffect(() => {
    lastTabsRef.current = activeTabs;
    lastTabIdRef.current = currentTabId;
  }, [activeTabs, currentTabId]);

  return {
    recordingState,
    error,
    isCapturing: isCapturingRef.current,
    isSpeechRecording,
    currentInterimTranscript,
    speechError,
    isSpeechSupported,
    hasSpeechPermission,
    startRecording,
    stopRecording,
    togglePause,
    toggleSpeechRecording,
    removeStep,
    updateStep,
    reorderSteps,
    clearSteps
  };
};
