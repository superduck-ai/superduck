import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { IntlShape } from 'react-intl';
import type { SupportedLocale } from '../../index-react-dom-intl';
import { elementSelectorInjector } from '../elementSelectorInjector';
import { generateWorkflowStepDescription, type ModelInvoker } from '../session';
import { getTextEntryDescription, generateElementDescription } from './fieldDescriptions';
import { addClickMarkerToScreenshot } from './screenshotMarker';
import { normalizeCapturedEvent } from './normalizeCapturedEvent';
import type { CapturedEvent, RecordingState, WorkflowStep } from './types';

export interface HandleCapturedEventParams {
  event: CapturedEvent;
  isRecordingRef: MutableRefObject<boolean>;
  processedEventsRef: MutableRefObject<Set<number>>;
  lastScreenshotRef: MutableRefObject<string>;
  lastSpeechTimestampRef: MutableRefObject<number>;
  speechSegmentsRef: MutableRefObject<Array<{ text: string; timestamp: number; isFinal: boolean }>>;
  injectionPendingTabsRef: MutableRefObject<Set<number>>;
  isPaused: boolean;
  setRecordingState: Dispatch<SetStateAction<RecordingState>>;
  setCurrentInterimTranscript: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string | null>>;
  captureFullScreen: () => Promise<unknown>;
  createMessage?: ModelInvoker;
  intl: IntlShape;
  locale: SupportedLocale;
  handleCapturedEvent: (event: CapturedEvent) => Promise<void>;
}

export async function workflowHandleCapturedEvent(
  params: HandleCapturedEventParams
): Promise<void> {
  const {
    event,
    isRecordingRef,
    processedEventsRef,
    lastScreenshotRef,
    lastSpeechTimestampRef,
    speechSegmentsRef,
    injectionPendingTabsRef,
    isPaused,
    setRecordingState,
    setCurrentInterimTranscript,
    setError,
    captureFullScreen,
    createMessage,
    intl,
    locale,
    handleCapturedEvent
  } = params;

  if (!event) return;

  if (processedEventsRef.current.has(event.timestamp)) return;
  processedEventsRef.current.add(event.timestamp);

  const eventTabId = event.tabId;

  if (eventTabId && isRecordingRef.current && !isPaused) {
    try {
      await captureFullScreen();
      let screenshot = lastScreenshotRef.current;
      lastScreenshotRef.current = '';

      setRecordingState((prev) => {
        const pendingTypeIndex = prev.steps.findIndex(
          (step) => step.action === 'type' && step.isPending
        );

        if (pendingTypeIndex >= 0) {
          const newSteps = [...prev.steps];
          newSteps[pendingTypeIndex] = {
            ...newSteps[pendingTypeIndex],
            screenshot,
            timestamp: event.timestamp - 1,
            isPending: false
          };
          return { ...prev, steps: newSteps };
        }

        if (event.typedText && event.typedInElement) {
          const description = getTextEntryDescription(
            intl,
            event.typedText,
            event.typedInElement.attributes?.name
          );

          const typeStep: WorkflowStep = {
            action: 'type',
            selector: event.typedInElement.selector,
            value: event.typedText,
            screenshot,
            description,
            url: event.url,
            tabId: eventTabId,
            timestamp: event.timestamp - 1
          };

          return { ...prev, steps: [...prev.steps, typeStep] };
        }

        return prev;
      });

      const clickPosition = event.clickCoordinates
        ? event.clickCoordinates
        : event.element.boundingRect
          ? {
              x: event.element.boundingRect.x + event.element.boundingRect.width / 2,
              y: event.element.boundingRect.y + event.element.boundingRect.height / 2
            }
          : undefined;

      if (screenshot && clickPosition && event.viewportWidth && event.viewportHeight) {
        try {
          screenshot = await addClickMarkerToScreenshot(
            screenshot,
            { x: clickPosition.x, y: clickPosition.y },
            { width: event.viewportWidth, height: event.viewportHeight }
          );
        } catch {
          // Keep original screenshot if marking fails
        }
      }

      const lastTimestamp = lastSpeechTimestampRef.current;
      const recentSegments = speechSegmentsRef.current.filter(
        (seg) => seg.timestamp >= lastTimestamp
      );
      const speechTranscript =
        recentSegments.length > 0
          ? recentSegments
              .map((seg) => seg.text)
              .join(' ')
              .trim()
          : undefined;

      lastSpeechTimestampRef.current = event.timestamp;
      setCurrentInterimTranscript('');

      const description = generateElementDescription(intl, event.element);

      const clickStep: WorkflowStep = {
        action: 'click',
        selector: event.element.selector,
        screenshot,
        description,
        url: event.url,
        tabId: eventTabId,
        elementText: event.element.text,
        elementAttributes: event.element.attributes,
        timestamp: event.timestamp,
        viewportDimensions:
          event.viewportWidth && event.viewportHeight
            ? { width: event.viewportWidth, height: event.viewportHeight }
            : undefined,
        clickPosition,
        isEnhancing: !!createMessage,
        speechTranscript
      };

      setRecordingState((prev) => ({ ...prev, steps: [...prev.steps, clickStep] }));

      if (createMessage) {
        chrome.tabs.get(eventTabId).then(async (tab) => {
          const pageTitle = tab.title || '';
          try {
            const enhancedDescription = await generateWorkflowStepDescription(
              {
                tagName: event.element.tagName,
                text: event.element.text,
                attributes: event.element.attributes || {},
                url: event.url,
                pageTitle,
                action: 'click',
                screenshot,
                speechTranscript
              },
              generateElementDescription(intl, event.element),
              createMessage,
              locale
            );
            setRecordingState((prev) => ({
              ...prev,
              steps: prev.steps.map((step) =>
                step.timestamp === clickStep.timestamp
                  ? {
                      ...step,
                      description: enhancedDescription || step.description,
                      isEnhancing: false
                    }
                  : step
              )
            }));
          } catch {
            setRecordingState((prev) => ({
              ...prev,
              steps: prev.steps.map((step) =>
                step.timestamp === clickStep.timestamp ? { ...step, isEnhancing: false } : step
              )
            }));
          }
        });
      }

      setTimeout(() => {
        processedEventsRef.current.delete(event.timestamp);
      }, 60000);

      if (
        isRecordingRef.current &&
        !isPaused &&
        eventTabId &&
        !injectionPendingTabsRef.current.has(eventTabId)
      ) {
        setTimeout(async () => {
          if (
            isRecordingRef.current &&
            !isPaused &&
            !injectionPendingTabsRef.current.has(eventTabId)
          ) {
            try {
              injectionPendingTabsRef.current.add(eventTabId);
              const result = await elementSelectorInjector.injectElementSelector(eventTabId);
              injectionPendingTabsRef.current.delete(eventTabId);
              if (result) {
                await handleCapturedEvent(normalizeCapturedEvent(result));
              }
            } catch {
              injectionPendingTabsRef.current.delete(eventTabId);
            }
          }
        }, 350);
      }
    } catch {
      setError('Failed to capture action');
    }
  } else {
    processedEventsRef.current.delete(event.timestamp);
  }
}
