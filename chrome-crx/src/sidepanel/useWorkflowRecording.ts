import { useState, useRef, useCallback, useEffect } from 'react';
import { useIntlSafe, type SupportedLocale } from '../index-react-dom-intl';
import { useSpeechRecognition } from './useSpeechRecognition';
import { useScreenCapture } from './useScreenCapture';
import { useTabStatusListener } from './useTabStatusListener';
import {
  elementSelectorInjector,
  isValidUrl,
  type CapturedEvent as InjectedCapturedEvent
} from './elementSelectorInjector';
import { generateWorkflowStepDescription, type ModelInvoker } from './sessionPool';

// Extend Window interface for Speech Recognition
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

// Types
export interface WorkflowStep {
  action: 'click' | 'type' | 'navigate' | 'create_tab' | 'narration';
  selector?: string;
  value?: string;
  screenshot?: string;
  description: string;
  url: string;
  tabId?: number;
  elementText?: string;
  elementAttributes?: Record<string, string>;
  timestamp: number;
  viewportDimensions?: { width: number; height: number };
  clickPosition?: { x: number; y: number };
  isEnhancing?: boolean;
  speechTranscript?: string;
  isPending?: boolean;
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  steps: WorkflowStep[];
  startTime: number | null;
}

interface ElementInfo {
  tagName: string;
  text?: string;
  attributes?: Record<string, string>;
  selector: string;
  boundingRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface CapturedEvent {
  type: string;
  element: ElementInfo;
  url: string;
  tabId: number;
  timestamp: number;
  clickCoordinates?: { x: number; y: number };
  viewportWidth?: number;
  viewportHeight?: number;
  typedText?: string;
  typedInElement?: ElementInfo;
}

interface KeystrokeUpdate {
  type: 'KEYSTROKE_UPDATE';
  text: string;
  element: ElementInfo;
  isFinal: boolean;
}

function normalizeCapturedEvent(event: InjectedCapturedEvent): CapturedEvent {
  return {
    type: 'ELEMENT_SELECTION',
    element: event.element,
    url: event.url,
    tabId: event.tabId,
    timestamp: event.timestamp,
    clickCoordinates: event.clickCoordinates,
    viewportWidth: event.viewportWidth,
    viewportHeight: event.viewportHeight,
    typedText: event.typedText,
    typedInElement: event.typedInElement
      ? {
          tagName: event.typedInElement.tagName,
          selector: event.typedInElement.selector,
          attributes: { name: event.typedInElement.name }
        }
      : undefined
  };
}

interface UseWorkflowRecordingProps {
  tabId: number;
  onComplete?: (steps: WorkflowStep[]) => void;
  createMessage?: ModelInvoker;
}

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
  const tabActivationListenerRef = useRef<((activeInfo: chrome.tabs.OnActivatedInfo) => void) | null>(
    null
  );
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

  const normalizeFieldName = useCallback((name?: string) => {
    if (!name) return '';
    return name
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .toLowerCase();
  }, []);

  const getTextEntryDescription = useCallback(
    (text: string, fieldName?: string) => {
      const preview30 = `${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`;
      const preview50 = `${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`;

      let description = intl.formatMessage(
        { id: 'workflow_type_text_preview', defaultMessage: 'Type "{text}"' },
        { text: preview30 }
      );

      if (text.includes('@')) {
        description = intl.formatMessage(
          { id: 'workflow_enter_email', defaultMessage: 'Enter email "{text}"' },
          { text }
        );
      } else if (text.length < 20 && !text.includes(' ')) {
        description = intl.formatMessage(
          { id: 'workflow_enter_text', defaultMessage: 'Enter "{text}"' },
          { text }
        );
      } else if (text.length > 50) {
        description = intl.formatMessage(
          { id: 'workflow_type_text_long', defaultMessage: 'Type text: "{text}"' },
          { text: preview50 }
        );
      }

      const normalizedFieldName = normalizeFieldName(fieldName);
      if (normalizedFieldName) {
        description = intl.formatMessage(
          {
            id: 'workflow_in_field',
            defaultMessage: '{description} in {fieldName} field'
          },
          {
            description,
            fieldName: normalizedFieldName
          }
        );
      }

      return description;
    },
    [intl, normalizeFieldName]
  );

  // Listen for keystroke updates from content script
  useEffect(() => {
    if (!isRecordingRef.current || recordingState.isPaused) return;

    const handleMessage = (message: KeystrokeUpdate, sender: chrome.runtime.MessageSender) => {
      if (message.type === 'KEYSTROKE_UPDATE' && sender.tab?.id === (currentTabId || tabId)) {
        const text = message.text;
        const element = message.element;

        // Remove pending type steps if text is empty
        if (!text) {
          setRecordingState((prev) => ({
            ...prev,
            steps: prev.steps.filter((step) => !(step.action === 'type' && step.isPending))
          }));
          return;
        }

        // Generate description
        const description = getTextEntryDescription(text, element.attributes?.name);

        setRecordingState((prev) => {
          const pendingIndex = prev.steps.findIndex(
            (step) => step.action === 'type' && step.isPending
          );

          if (pendingIndex >= 0) {
            // Update existing pending step
            const newSteps = [...prev.steps];
            newSteps[pendingIndex] = {
              ...newSteps[pendingIndex],
              value: text,
              description,
              selector: element.selector,
              isPending: !message.isFinal
            };
            return { ...prev, steps: newSteps };
          }

          if (!message.isFinal) {
            // Create new pending step
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
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [recordingState.isPaused, currentTabId, tabId, getTextEntryDescription]);

  // Add click marker to screenshot
  const addClickMarkerToScreenshot = async (
    base64Screenshot: string,
    clickPosition: { x: number; y: number },
    viewportDimensions: { width: number; height: number }
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const scaleX = img.width / viewportDimensions.width;
          const scaleY = img.height / viewportDimensions.height;
          const scaledX = clickPosition.x * scaleX;
          const scaledY = clickPosition.y * scaleY;

          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0);

          // Draw circle marker
          const radius = Math.max(40, Math.min(120, 0.05 * Math.min(img.width, img.height)));
          ctx.beginPath();
          ctx.arc(scaledX, scaledY, radius, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(44, 132, 219, 0.3)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(44, 132, 219, 1)';
          ctx.lineWidth = 2;
          ctx.stroke();

          const markedBase64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
          resolve(markedBase64);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => {
        reject(new Error('Failed to load screenshot image'));
      };
      img.src = `data:image/jpeg;base64,${base64Screenshot}`;
    });
  };

  // Generate element description
  const generateElementDescription = useCallback((element: ElementInfo): string => {
    const tagName = element.tagName.toLowerCase();
    const text = element.text?.trim();
    const attrs = element.attributes || {};
    const truncatedText40 = (value: string) => (value.length > 40 ? `${value.substring(0, 40)}...` : value);
    const truncatedText50 = (value: string) => (value.length > 50 ? `${value.substring(0, 50)}...` : value);
    const clickNamed = (value: string) =>
      intl.formatMessage(
        { id: 'workflow_click_named', defaultMessage: 'Click on "{target}"' },
        { target: value }
      );

    if (attrs['aria-label']) {
      return clickNamed(attrs['aria-label']);
    }

    if (attrs.title && (!text || text.length <= 3)) {
      return clickNamed(attrs.title);
    }

    if ((tagName === 'button' || tagName === 'a') && text && text.length > 1) {
      return intl.formatMessage(
        { id: 'workflow_click_button', defaultMessage: 'Click on "{target}" button' },
        { target: truncatedText40(text) }
      );
    }

    if ((tagName === 'button' || tagName === 'a') && attrs.title) {
      return intl.formatMessage(
        { id: 'workflow_click_button', defaultMessage: 'Click on "{target}" button' },
        { target: attrs.title }
      );
    }

    if (tagName === 'input') {
      const type = attrs.type || 'text';
      const placeholder = attrs.placeholder;
      const name = attrs.name;

      if (type === 'submit' || type === 'button') {
        const value = attrs.value || text;
        return value
          ? intl.formatMessage(
              { id: 'workflow_click_button', defaultMessage: 'Click on "{target}" button' },
              { target: value }
            )
          : intl.formatMessage({
              id: 'workflow_click_submit_button',
              defaultMessage: 'Click on submit button'
            });
      }

      if (placeholder) {
        return intl.formatMessage(
          { id: 'workflow_click_field', defaultMessage: 'Click on "{target}" field' },
          { target: placeholder }
        );
      }

      if (name) {
        return intl.formatMessage(
          { id: 'workflow_click_named_field', defaultMessage: 'Click on {fieldName} field' },
          { fieldName: normalizeFieldName(name) }
        );
      }

      return intl.formatMessage(
        { id: 'workflow_click_input', defaultMessage: 'Click on {inputType} input' },
        { inputType: type }
      );
    }

    if (tagName === 'select') {
      const name = attrs.name;
      return name
        ? intl.formatMessage(
            {
              id: 'workflow_click_named_dropdown',
              defaultMessage: 'Click on {fieldName} dropdown'
            },
            { fieldName: normalizeFieldName(name) }
          )
        : intl.formatMessage({
            id: 'workflow_click_dropdown_menu',
            defaultMessage: 'Click on dropdown menu'
          });
    }

    if (tagName === 'img') {
      const alt = attrs.alt;
      return alt
        ? intl.formatMessage(
            { id: 'workflow_click_image_named', defaultMessage: 'Click on "{target}" image' },
            { target: alt }
          )
        : intl.formatMessage({ id: 'workflow_click_image', defaultMessage: 'Click on image' });
    }

    if (attrs.role) {
      return text
        ? clickNamed(truncatedText40(text))
        : intl.formatMessage(
            { id: 'workflow_click_role', defaultMessage: 'Click on {role}' },
            { role: attrs.role }
          );
    }

    if (tagName === 'div' || tagName === 'span') {
      const tooltip =
        attrs.title || attrs['data-tooltip'] || attrs['data-tip'] || attrs['data-original-title'];
      if (tooltip && (!text || text.length <= 3)) {
        return clickNamed(tooltip);
      }

      if (text) {
        const displayText = truncatedText50(text);
        if (attrs.class?.includes('menu') || attrs.class?.includes('nav')) {
          return intl.formatMessage(
            {
              id: 'workflow_click_menu_item',
              defaultMessage: 'Click on "{target}" menu item'
            },
            { target: displayText }
          );
        }
        return clickNamed(displayText);
      }

      if (tooltip) {
        return clickNamed(tooltip);
      }
    }

    if (attrs.id) {
      return intl.formatMessage(
        { id: 'workflow_click_id', defaultMessage: 'Click on {target}' },
        {
          target: attrs.id
            .replace(/-/g, ' ')
            .replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .trim()
        }
      );
    }

    const tooltip =
      attrs.title ||
      attrs['data-tooltip'] ||
      attrs['data-tip'] ||
      attrs['data-original-title'] ||
      attrs['aria-description'];
    if (tooltip) {
      return clickNamed(tooltip);
    }

    if (text) {
      return clickNamed(truncatedText40(text));
    }

    return intl.formatMessage(
      { id: 'workflow_click_tag_element', defaultMessage: 'Click on {tagName} element' },
      { tagName }
    );
  }, [intl, normalizeFieldName]);

  // Handle captured event (click)
  const handleCapturedEvent = useCallback(
    async (event: CapturedEvent) => {
      if (!event) return;

      // Deduplicate events
      if (processedEventsRef.current.has(event.timestamp)) return;
      processedEventsRef.current.add(event.timestamp);

      const eventTabId = event.tabId;

      if (eventTabId && isRecordingRef.current && !recordingState.isPaused) {
        try {
          // Capture screenshot
          await captureFullScreen();
          let screenshot = lastScreenshotRef.current;
          lastScreenshotRef.current = '';

          // Update pending type step with screenshot
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

            // Handle typed text from event
            if (event.typedText && event.typedInElement) {
              const description = getTextEntryDescription(
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

          // Calculate click position
          const clickPosition = event.clickCoordinates
            ? event.clickCoordinates
            : event.element.boundingRect
              ? {
                  x: event.element.boundingRect.x + event.element.boundingRect.width / 2,
                  y: event.element.boundingRect.y + event.element.boundingRect.height / 2
                }
              : undefined;

          // Add click marker to screenshot
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

          // Get speech transcript since last capture
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

          // Generate description
          const description = generateElementDescription(event.element);

          // Create click step
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

          // Enhance description with AI if createMessage function is available
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
                  generateElementDescription(event.element),
                  createMessage,
                  intl.locale as SupportedLocale
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

          // Clean up processed event after 1 minute
          setTimeout(() => {
            processedEventsRef.current.delete(event.timestamp);
          }, 60000);

          // Re-inject element selector after delay
          if (
            isRecordingRef.current &&
            !recordingState.isPaused &&
            eventTabId &&
            !injectionPendingTabsRef.current.has(eventTabId)
          ) {
            setTimeout(async () => {
              if (
                isRecordingRef.current &&
                !recordingState.isPaused &&
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
    },
    [recordingState.isPaused, captureFullScreen, createMessage, generateElementDescription, getTextEntryDescription, intl.locale]
  );

  // Start recording
  const startRecording = useCallback(
    async (enableVoice?: boolean) => {
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

      // Start speech recognition if enabled
      const shouldStartSpeech =
        enableVoice === undefined
          ? isSpeechSupported && hasSpeechPermission
          : enableVoice && isSpeechSupported && hasSpeechPermission;
      if (shouldStartSpeech) {
        await startSpeechRecording();
      }

      // Initialize with current tab
      const initialTabId = tabId;
      if (initialTabId) {
        setCurrentTabId(initialTabId);
        setActiveTabs(new Set([initialTabId]));
        visitedTabsRef.current = new Set([initialTabId]);
        createdTabsRef.current = new Set([initialTabId]);

        // Get tab group and add initial navigate step
        chrome.tabs.get(initialTabId).then((tab) => {
          tabGroupIdRef.current = tab.groupId;

          const navigateStep: WorkflowStep = {
            action: 'navigate',
            description: intl.formatMessage(
              { id: 'navigate_to', defaultMessage: 'Navigate to {url}' },
              {
                url:
                  tab.url ||
                  intl.formatMessage({ id: 'page', defaultMessage: 'page' })
              }
            ),
            url: tab.url || '',
            tabId: initialTabId,
            timestamp: startTime - 100
          };

          setRecordingState((prev) => ({ ...prev, steps: [navigateStep, ...prev.steps] }));
        });
      }

      // Listen for tab activation
      const handleTabActivation = (activeInfo: chrome.tabs.OnActivatedInfo) => {
        if (!isRecordingRef.current || recordingState.isPaused) return;

        const activatedTabId = activeInfo.tabId;

        chrome.tabs.get(activatedTabId).then((tab) => {
          const tabGroupId = tab.groupId;
          const recordingGroupId = tabGroupIdRef.current;

          // Check if tab is in the same group
          if (
            recordingGroupId === undefined ||
            recordingGroupId === -1 ||
            tabGroupId !== recordingGroupId
          ) {
            // Pause recording if tab is outside group
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

          // Add create_tab step if new tab
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

          // Add navigate step if new URL
          if (isNewUrl && isValidUrl(tab.url)) {
            visitedTabsRef.current.add(activatedTabId);

            const navigateStep: WorkflowStep = {
              action: 'navigate',
              description: intl.formatMessage(
                { id: 'navigate_to', defaultMessage: 'Navigate to {url}' },
                {
                  url:
                    tab.url ||
                    intl.formatMessage({ id: 'page', defaultMessage: 'page' })
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

          // Inject element selector if valid URL
          if (isValidUrl(tab.url)) {
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

      // Inject element selector into initial tab
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
    // Finalize pending type steps
    setRecordingState((prev) => ({
      ...prev,
      steps: prev.steps.map((step) =>
        step.action === 'type' && step.isPending ? { ...step, isPending: false } : step
      )
    }));

    const { steps } = recordingState;

    isRecordingRef.current = false;

    // Stop speech recognition
    if (isSpeechRecording) {
      stopSpeechRecording();
    }

    // Remove tab activation listener
    if (tabActivationListenerRef.current) {
      chrome.tabs.onActivated.removeListener(tabActivationListenerRef.current);
      tabActivationListenerRef.current = null;
    }

    // Cancel element selectors
    if (activeTabs.size > 0) {
      activeTabs.forEach((tid) => {
        chrome.tabs.sendMessage(tid, { type: 'CANCEL_ELEMENT_SELECTOR' }).catch(() => {});
      });
      setActiveTabs(new Set());
    }

    // Reset state
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

    // Call onComplete callback
    if (steps.length > 0 && onComplete) {
      onComplete(steps);
    }
  }, [recordingState, onComplete, activeTabs, isSpeechRecording, stopSpeechRecording]);

  // Toggle pause
  const togglePause = useCallback(() => {
    const wasPaused = recordingState.isPaused;

    setRecordingState((prev) => ({ ...prev, isPaused: !prev.isPaused }));

    if (wasPaused) {
      // Resume: re-inject element selector
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
      // Resume speech recording only if it was active before pause
      if (speechWasRecordingBeforePauseRef.current && !isSpeechRecording) {
        startSpeechRecording();
      }
    } else {
      // Pause: cancel element selectors
      injectionPendingTabsRef.current.clear();
      if (activeTabs.size > 0) {
        activeTabs.forEach((tid) => {
          chrome.tabs.sendMessage(tid, { type: 'CANCEL_ELEMENT_SELECTOR' }).catch(() => {});
        });
      }
      // Remember speech recording state and stop it during pause
      speechWasRecordingBeforePauseRef.current = isSpeechRecording;
      if (isSpeechRecording) {
        stopSpeechRecording();
      }
    }
  }, [recordingState.isPaused, activeTabs, currentTabId, tabId, handleCapturedEvent, isSpeechRecording, startSpeechRecording, stopSpeechRecording]);

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

  // Helper: Check if URL is valid for recording
  const isValidUrl = (url?: string): boolean => {
    if (!url) return false;
    return url.startsWith('http://') || url.startsWith('https://');
  };

  // Listen for tab status changes (loading -> complete)
  useTabStatusListener(
    currentTabId || tabId,
    (changeInfo) => {
      const activeTabId = currentTabId || tabId;

      // Clear injection pending when loading starts
      if (
        changeInfo.status === 'loading' &&
        activeTabId &&
        injectionPendingTabsRef.current.has(activeTabId)
      ) {
        injectionPendingTabsRef.current.delete(activeTabId);
      }

      // Inject element selector when page completes loading
      if (
        changeInfo.status === 'complete' &&
        isRecordingRef.current &&
        !recordingState.isPaused &&
        activeTabId
      ) {
        chrome.tabs.get(activeTabId).then((tab) => {
          if (!isValidUrl(tab.url)) return;

          // Add navigate step if new URL
          if (!visitedTabsRef.current.has(activeTabId)) {
            visitedTabsRef.current.add(activeTabId);

            const navigateStep: WorkflowStep = {
              action: 'navigate',
              description: intl.formatMessage(
                { id: 'navigate_to', defaultMessage: 'Navigate to {url}' },
                {
                  url:
                    tab.url ||
                    intl.formatMessage({ id: 'page', defaultMessage: 'page' })
                }
              ),
              url: tab.url || '',
              tabId: activeTabId,
              timestamp: Date.now() - 100
            };

            setRecordingState((prev) => ({ ...prev, steps: [...prev.steps, navigateStep] }));
          }

          // Inject element selector
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
    [currentTabId, tabId, recordingState.isPaused, handleCapturedEvent]
  );

  // Listen for tab activation changes
  useTabStatusListener(
    currentTabId || tabId,
    (changeInfo) => {
      const activeTabId = currentTabId || tabId;

      if (
        changeInfo.active === true &&
        isRecordingRef.current &&
        !recordingState.isPaused &&
        activeTabId
      ) {
        // Cancel existing selector
        chrome.tabs.sendMessage(activeTabId, { type: 'CANCEL_ELEMENT_SELECTOR' }).catch(() => {});
        injectionPendingTabsRef.current.delete(activeTabId);

        // Re-inject after delay
        setTimeout(() => {
          if (isRecordingRef.current && !recordingState.isPaused) {
            chrome.tabs.get(activeTabId).then((tab) => {
              if (isValidUrl(tab.url)) {
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
    [currentTabId, tabId, recordingState.isPaused, handleCapturedEvent]
  );

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
