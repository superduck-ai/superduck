import { useEffect } from 'react';
import type React from 'react';
import type { IntlShape } from 'react-intl';
import { getTextEntryDescription } from './fieldDescriptions';
import type { KeystrokeUpdate, RecordingState, WorkflowStep } from './types';

export function useKeystrokeUpdates({
  isRecordingRef,
  isPaused,
  currentTabId,
  tabId,
  intl,
  setRecordingState
}: {
  isRecordingRef: React.MutableRefObject<boolean>;
  isPaused: boolean;
  currentTabId: number | undefined;
  tabId: number | null;
  intl: IntlShape;
  setRecordingState: React.Dispatch<React.SetStateAction<RecordingState>>;
}) {
  useEffect(() => {
    if (!isRecordingRef.current || isPaused) return;

    const handleMessage = (message: KeystrokeUpdate, sender: chrome.runtime.MessageSender) => {
      if (message.type !== 'KEYSTROKE_UPDATE' || sender.tab?.id !== (currentTabId || tabId)) {
        return;
      }

      const text = message.text;
      const element = message.element;

      if (!text) {
        setRecordingState((prev) => ({
          ...prev,
          steps: prev.steps.filter((step) => !(step.action === 'type' && step.isPending))
        }));
        return;
      }

      const description = getTextEntryDescription(intl, text, element.attributes?.name);

      setRecordingState((prev) => {
        const pendingIndex = prev.steps.findIndex(
          (step) => step.action === 'type' && step.isPending
        );

        if (pendingIndex >= 0) {
          const nextSteps = [...prev.steps];
          nextSteps[pendingIndex] = {
            ...nextSteps[pendingIndex],
            value: text,
            description,
            selector: element.selector,
            isPending: !message.isFinal
          };
          return { ...prev, steps: nextSteps };
        }

        if (!message.isFinal) {
          const newStep: WorkflowStep = {
            action: 'type',
            selector: element.selector,
            value: text,
            description,
            url: window.location.href,
            tabId: sender.tab?.id,
            timestamp: Date.now(),
            isPending: true
          };
          return { ...prev, steps: [...prev.steps, newStep] };
        }

        return prev;
      });
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [isRecordingRef, isPaused, currentTabId, tabId, intl, setRecordingState]);
}
