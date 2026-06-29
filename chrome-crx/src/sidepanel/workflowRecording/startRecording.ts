import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { IntlShape } from 'react-intl';
import { elementSelectorInjector } from '../elementSelectorInjector';
import { normalizeCapturedEvent } from './normalizeCapturedEvent';
import { isRecordingUrl } from './utils';
import type { CapturedEvent, RecordingState, WorkflowStep } from './types';

export interface StartRecordingParams {
  enableVoice?: boolean;
  tabId: number;
  isRecordingRef: MutableRefObject<boolean>;
  visitedTabsRef: MutableRefObject<Set<number>>;
  createdTabsRef: MutableRefObject<Set<number>>;
  tabGroupIdRef: MutableRefObject<number | undefined>;
  injectionPendingTabsRef: MutableRefObject<Set<number>>;
  tabActivationListenerRef: MutableRefObject<
    ((activeInfo: chrome.tabs.OnActivatedInfo) => void) | null
  >;
  lastSpeechTimestampRef: MutableRefObject<number>;
  isPaused: boolean;
  activeTabs: Set<number>;
  isSpeechSupported: boolean;
  hasSpeechPermission: boolean;
  setRecordingState: Dispatch<SetStateAction<RecordingState>>;
  setCurrentTabId: Dispatch<SetStateAction<number | undefined>>;
  setActiveTabs: Dispatch<SetStateAction<Set<number>>>;
  setError: Dispatch<SetStateAction<string | null>>;
  startSpeechRecording: () => Promise<unknown>;
  handleCapturedEvent: (event: CapturedEvent) => Promise<void>;
  intl: IntlShape;
}

export async function workflowStartRecording(params: StartRecordingParams): Promise<void> {
  const {
    enableVoice,
    tabId,
    isRecordingRef,
    visitedTabsRef,
    createdTabsRef,
    tabGroupIdRef,
    injectionPendingTabsRef,
    tabActivationListenerRef,
    lastSpeechTimestampRef,
    isPaused,
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
  } = params;

  isRecordingRef.current = true;
  const startTime = Date.now();

  setRecordingState({
    isRecording: true,
    isPaused: false,
    steps: [],
    startTime
  });

  setError(null);
  lastSpeechTimestampRef.current = startTime;

  const shouldStartSpeech =
    enableVoice === undefined
      ? isSpeechSupported && hasSpeechPermission
      : enableVoice && isSpeechSupported && hasSpeechPermission;
  if (shouldStartSpeech) {
    await startSpeechRecording();
  }

  const initialTabId = tabId;
  if (initialTabId) {
    setCurrentTabId(initialTabId);
    setActiveTabs(new Set([initialTabId]));
    visitedTabsRef.current = new Set([initialTabId]);
    createdTabsRef.current = new Set([initialTabId]);

    chrome.tabs.get(initialTabId).then((tab) => {
      tabGroupIdRef.current = tab.groupId;

      const navigateStep: WorkflowStep = {
        action: 'navigate',
        description: intl.formatMessage(
          { id: 'navigate_to', defaultMessage: 'Navigate to {url}' },
          {
            url: tab.url || intl.formatMessage({ id: 'page', defaultMessage: 'page' })
          }
        ),
        url: tab.url || '',
        tabId: initialTabId,
        timestamp: startTime - 100
      };

      setRecordingState((prev) => ({ ...prev, steps: [navigateStep, ...prev.steps] }));
    });
  }

  const handleTabActivation = (activeInfo: chrome.tabs.OnActivatedInfo) => {
    if (!isRecordingRef.current || isPaused) return;

    const activatedTabId = activeInfo.tabId;

    chrome.tabs.get(activatedTabId).then((tab) => {
      const tabGroupId = tab.groupId;
      const recordingGroupId = tabGroupIdRef.current;

      if (
        recordingGroupId === undefined ||
        recordingGroupId === -1 ||
        tabGroupId !== recordingGroupId
      ) {
        setRecordingState((prev) => ({ ...prev, isPaused: true }));
        activeTabs.forEach((tid) => {
          chrome.tabs.sendMessage(tid, { type: 'CANCEL_ELEMENT_SELECTOR' }).catch(() => {});
        });
        return;
      }

      const isNewTab = !createdTabsRef.current.has(activatedTabId);
      const isNewUrl = !visitedTabsRef.current.has(activatedTabId);

      if (isNewTab) {
        createdTabsRef.current.add(activatedTabId);
      }

      if (isNewTab) {
        const createTabStep: WorkflowStep = {
          action: 'create_tab',
          description: intl.formatMessage({
            id: 'create_new_tab',
            defaultMessage: 'Create new tab'
          }),
          url: tab.url || '',
          tabId: activatedTabId,
          timestamp: Date.now() - 150
        };
        setRecordingState((prev) => ({ ...prev, steps: [...prev.steps, createTabStep] }));
      }

      if (isNewUrl && isRecordingUrl(tab.url)) {
        visitedTabsRef.current.add(activatedTabId);

        const navigateStep: WorkflowStep = {
          action: 'navigate',
          description: intl.formatMessage(
            { id: 'navigate_to', defaultMessage: 'Navigate to {url}' },
            {
              url: tab.url || intl.formatMessage({ id: 'page', defaultMessage: 'page' })
            }
          ),
          url: tab.url || '',
          tabId: activatedTabId,
          timestamp: Date.now() - 100
        };
        setRecordingState((prev) => ({ ...prev, steps: [...prev.steps, navigateStep] }));
      }

      setCurrentTabId(activatedTabId);
      setActiveTabs((prev) => new Set(prev).add(activatedTabId));

      if (isRecordingUrl(tab.url)) {
        if (!injectionPendingTabsRef.current.has(activatedTabId)) {
          injectionPendingTabsRef.current.add(activatedTabId);
          elementSelectorInjector
            .injectElementSelector(activatedTabId)
            .then((result) => {
              injectionPendingTabsRef.current.delete(activatedTabId);
              if (result) {
                handleCapturedEvent(normalizeCapturedEvent(result));
              }
            })
            .catch(() => {
              injectionPendingTabsRef.current.delete(activatedTabId);
            });
        }
      }
    });
  };

  chrome.tabs.onActivated.addListener(handleTabActivation);
  tabActivationListenerRef.current = handleTabActivation;

  if (initialTabId) {
    try {
      injectionPendingTabsRef.current.add(initialTabId);
      elementSelectorInjector
        .injectElementSelector(initialTabId)
        .then((result) => {
          injectionPendingTabsRef.current.delete(initialTabId);
          if (result) {
            handleCapturedEvent(normalizeCapturedEvent(result));
          }
        })
        .catch(() => {
          injectionPendingTabsRef.current.delete(initialTabId);
        });
    } catch {
      setError('Failed to activate element selector');
    }
  }
}
