import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { IntlShape } from 'react-intl';
import { useTabStatusListener } from '../hooks/useTabStatusListener';
import { elementSelectorInjector } from '../elementSelectorInjector';
import { normalizeCapturedEvent } from './normalizeCapturedEvent';
import { isRecordingUrl } from './utils';
import type { CapturedEvent, RecordingState, WorkflowStep } from './types';

export interface TabStatusListenersParams {
  currentTabId: number | undefined;
  tabId: number;
  isPaused: boolean;
  isRecordingRef: MutableRefObject<boolean>;
  injectionPendingTabsRef: MutableRefObject<Set<number>>;
  visitedTabsRef: MutableRefObject<Set<number>>;
  setRecordingState: Dispatch<SetStateAction<RecordingState>>;
  handleCapturedEvent: (event: CapturedEvent) => Promise<void>;
  intl: IntlShape;
}

export function useTabStatusListeners(params: TabStatusListenersParams): void {
  const {
    currentTabId,
    tabId,
    isPaused,
    isRecordingRef,
    injectionPendingTabsRef,
    visitedTabsRef,
    setRecordingState,
    handleCapturedEvent,
    intl
  } = params;

  useTabStatusListener(
    currentTabId || tabId,
    (changeInfo) => {
      const activeTabId = currentTabId || tabId;

      if (
        changeInfo.status === 'loading' &&
        activeTabId &&
        injectionPendingTabsRef.current.has(activeTabId)
      ) {
        injectionPendingTabsRef.current.delete(activeTabId);
      }

      if (changeInfo.status === 'complete' && isRecordingRef.current && !isPaused && activeTabId) {
        chrome.tabs.get(activeTabId).then((tab) => {
          if (!isRecordingUrl(tab.url)) return;

          if (!visitedTabsRef.current.has(activeTabId)) {
            visitedTabsRef.current.add(activeTabId);

            const navigateStep: WorkflowStep = {
              action: 'navigate',
              description: intl.formatMessage(
                { id: 'navigate_to', defaultMessage: 'Navigate to {url}' },
                {
                  url: tab.url || intl.formatMessage({ id: 'page', defaultMessage: 'page' })
                }
              ),
              url: tab.url || '',
              tabId: activeTabId,
              timestamp: Date.now() - 100
            };

            setRecordingState((prev) => ({ ...prev, steps: [...prev.steps, navigateStep] }));
          }

          if (!injectionPendingTabsRef.current.has(activeTabId)) {
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
        });
      }
    },
    ['status'],
    [currentTabId, tabId, isPaused, handleCapturedEvent]
  );

  useTabStatusListener(
    currentTabId || tabId,
    (changeInfo) => {
      const activeTabId = currentTabId || tabId;

      if (changeInfo.active === true && isRecordingRef.current && !isPaused && activeTabId) {
        chrome.tabs.sendMessage(activeTabId, { type: 'CANCEL_ELEMENT_SELECTOR' }).catch(() => {});
        injectionPendingTabsRef.current.delete(activeTabId);

        setTimeout(() => {
          if (isRecordingRef.current && !isPaused) {
            chrome.tabs.get(activeTabId).then((tab) => {
              if (isRecordingUrl(tab.url)) {
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
            });
          }
        }, 150);
      }
    },
    ['active'],
    [currentTabId, tabId, isPaused, handleCapturedEvent]
  );
}
