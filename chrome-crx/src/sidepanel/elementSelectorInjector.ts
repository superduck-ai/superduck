interface ElementInfo {
  selector: string;
  tagName: string;
  text: string;
  attributes: Record<string, string>;
  boundingRect: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export interface TypedElementInfo {
  tagName: string;
  selector: string;
  name: string;
}

export interface CapturedEvent {
  element: ElementInfo;
  url: string;
  timestamp: number;
  tabId: number;
  viewportWidth: number;
  viewportHeight: number;
  clickCoordinates?: { x: number; y: number };
  typedText?: string;
  typedInElement?: TypedElementInfo;
}

type ElementSelectionMessage = {
  type: 'ELEMENT_SELECTION';
  cancelled?: boolean;
  elementInfo?: ElementInfo;
  url?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  clickCoordinates?: { x: number; y: number };
  typedText?: string;
  typedInElement?: TypedElementInfo;
};

type CancelElementSelectorMessage = {
  type: 'CANCEL_ELEMENT_SELECTOR';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCancelElementSelectorMessage(message: unknown): message is CancelElementSelectorMessage {
  return isRecord(message) && message.type === 'CANCEL_ELEMENT_SELECTOR';
}

function isElementSelectionMessage(message: unknown): message is ElementSelectionMessage {
  return isRecord(message) && message.type === 'ELEMENT_SELECTION';
}

class ElementSelectorInjector {
  private static instance: ElementSelectorInjector | null = null;

  static getInstance(): ElementSelectorInjector {
    if (!ElementSelectorInjector.instance) {
      ElementSelectorInjector.instance = new ElementSelectorInjector();
    }
    return ElementSelectorInjector.instance;
  }

  async injectElementSelector(tabId: number): Promise<CapturedEvent | null> {
    return new Promise((resolve) => {
      const messageListener = async (message: unknown, sender: chrome.runtime.MessageSender) => {
        if (sender.tab?.id === tabId && isElementSelectionMessage(message)) {
          chrome.runtime.onMessage.removeListener(messageListener);

          if (message.cancelled) {
            resolve(null);
          } else if (message.elementInfo) {
            const eventTabId = sender.tab?.id || tabId;
            resolve({
              element: message.elementInfo,
              url: message.url || '',
              timestamp: Date.now(),
              tabId: eventTabId,
              viewportWidth: message.viewportWidth ?? 0,
              viewportHeight: message.viewportHeight ?? 0,
              clickCoordinates: message.clickCoordinates,
              typedText: message.typedText,
              typedInElement: message.typedInElement
            });
          }
        }

        if (isCancelElementSelectorMessage(message)) {
          chrome.runtime.onMessage.removeListener(messageListener);
          resolve(null);
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);

      // Timeout after 60 seconds
      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(messageListener);
        resolve(null);
      }, 60000);

      // Inject the element selector script into the page
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: elementSelectorScript // Use standalone function
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error('[Element Selector] Injection failed:', chrome.runtime.lastError);
            chrome.runtime.onMessage.removeListener(messageListener);
            resolve(null);
          } else {
            console.log('[Element Selector] Injection successful for tab:', tabId);
          }
        }
      );
    });
  }
}

// Standalone function for injection (not a class method)
// This function will be serialized and injected into the page
function elementSelectorScript() {
  interface SelectorWindow extends Window {
    __clickListenerActive?: boolean;
    __keystrokeListenersActive?: boolean;
  }

  const win = window as SelectorWindow;

  // Prevent multiple injections
  if (win.__clickListenerActive) {
    return;
  }

  win.__clickListenerActive = true;

  // Listen for cancel messages
  const cancelListener = (message: unknown) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      message.type === 'CANCEL_ELEMENT_SELECTOR'
    ) {
      document.removeEventListener('click', clickListener, true);
      document.removeEventListener('keydown', escapeListener, true);
      document.removeEventListener('keydown', keystrokeListener, true);
      document.removeEventListener('focus', focusListener, true);
      chrome.runtime.onMessage.removeListener(cancelListener);
      win.__clickListenerActive = false;
      win.__keystrokeListenersActive = false;
    }
  };

  chrome.runtime.onMessage.addListener(cancelListener);

  let isProcessing = false;
  let keystrokeBuffer: string[] = [];
  let currentInputElement: HTMLElement | null = null;

  // Helper to get class name
  const getClassName = (element: Element): string => {
    const classNameValue: unknown = element.className;

    if (!classNameValue) {
      return '';
    }

    if (
      typeof classNameValue === 'object' &&
      classNameValue !== null &&
      'baseVal' in classNameValue
    ) {
      const value = classNameValue.baseVal;
      return typeof value === 'string' ? value : '';
    }

    return String(classNameValue);
  };

  // Setup keystroke listeners (only if not already active)
  const shouldSetupKeystrokeListeners = !win.__keystrokeListenersActive;

  // Focus listener - detects when focus changes between input elements
  const focusListener = (event: FocusEvent) => {
    const target = event.target as HTMLElement;

    // If focus changed and we have buffered keystrokes, send them
    if (currentInputElement && target !== currentInputElement && keystrokeBuffer.length > 0) {
      const className = getClassName(currentInputElement);
      chrome.runtime.sendMessage({
        type: 'KEYSTROKE_UPDATE',
        text: keystrokeBuffer.join(''),
        element: {
          tagName: currentInputElement.tagName.toLowerCase(),
          selector: currentInputElement.id
            ? `#${currentInputElement.id}`
            : className
            ? `${currentInputElement.tagName.toLowerCase()}.${className.trim().split(/\s+/).join('.')}`
            : currentInputElement.tagName.toLowerCase(),
          name:
            currentInputElement.getAttribute('name') ||
            currentInputElement.getAttribute('placeholder') ||
            currentInputElement.getAttribute('aria-label') ||
            '',
        },
        isFinal: true,
      });
      keystrokeBuffer = [];
    }

    currentInputElement = target;
  };

  if (shouldSetupKeystrokeListeners) {
    document.addEventListener('focus', focusListener, true);
  }

  // Keystroke listener - captures typing in input fields
  const keystrokeListener = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;

    // Set current input element if typing in an input field
    if (target && target.tagName && ['INPUT', 'TEXTAREA'].includes(target.tagName.toUpperCase())) {
      currentInputElement = target;
    }

    if (!currentInputElement) {
      return;
    }

    const inputElement = currentInputElement;
    const tagName = inputElement.tagName.toLowerCase();

    // Only capture keystrokes in editable elements
    if (
      !(
        tagName === 'textarea' ||
        (tagName === 'input' &&
          !(inputElement as HTMLInputElement).type.match(/submit|button|checkbox|radio|file/)) ||
        inputElement.getAttribute('contenteditable') === 'true'
      )
    ) {
      return;
    }

    const key = event.key;
    const className = getClassName(inputElement);

    const sendKeystrokeUpdate = () => {
      chrome.runtime.sendMessage({
        type: 'KEYSTROKE_UPDATE',
        text: keystrokeBuffer.join(''),
        element: {
          tagName: inputElement.tagName.toLowerCase(),
          selector: inputElement.id
            ? `#${inputElement.id}`
            : className
            ? `${inputElement.tagName.toLowerCase()}.${className.trim().split(/\s+/).join('.')}`
            : inputElement.tagName.toLowerCase(),
          name:
            inputElement.getAttribute('name') ||
            inputElement.getAttribute('placeholder') ||
            inputElement.getAttribute('aria-label') ||
            '',
        },
      });
    };

    // Handle special keys
    if (key === 'Backspace') {
      keystrokeBuffer.pop();
      sendKeystrokeUpdate();
      return;
    }

    if (key === 'Enter') {
      keystrokeBuffer.push('\n');
      sendKeystrokeUpdate();
      return;
    }

    if (key === 'Tab') {
      keystrokeBuffer.push('\t');
      sendKeystrokeUpdate();
      return;
    }

    // Ignore modifier keys and special keys
    if (
      ['Control', 'Shift', 'Alt', 'Meta'].includes(key) ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      key.startsWith('Arrow') ||
      (key.startsWith('F') && key.length <= 3) ||
      ['Home', 'End', 'PageUp', 'PageDown', 'Delete', 'Insert', 'Escape'].includes(key) ||
      key.length !== 1
    ) {
      return;
    }

    // Add regular character to buffer
    keystrokeBuffer.push(key);
    sendKeystrokeUpdate();
  };

  if (shouldSetupKeystrokeListeners) {
    document.addEventListener('keydown', keystrokeListener, true);
    win.__keystrokeListenersActive = true;
  }

  // Click listener - captures element clicks
  const clickListener = async (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (isProcessing) {
      return;
    }

    isProcessing = true;

    try {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      if (!element) {
        isProcessing = false;
        return;
      }

      const rect = element.getBoundingClientRect();
      const tagName = element.tagName.toLowerCase();

      // Generate selector candidates
      const selectors: string[] = [];

      // ID selector
      if (element.id) {
        selectors.push(`#${element.id}`);
      }

      // Class selector
      const className = getClassName(element);
      if (className) {
        const classes = className.trim().split(/\s+/).filter((c) => c);
        if (classes.length > 0) {
          selectors.push(`${tagName}.${classes.join('.')}`);
        }
      }

      // Data attribute selectors
      const dataAttrs = Array.from(element.attributes)
        .filter((attr) => attr.name.startsWith('data-'))
        .slice(0, 2);
      if (dataAttrs.length > 0) {
        const dataSelector = dataAttrs.map((attr) => `[${attr.name}="${attr.value}"]`).join('');
        selectors.push(`${tagName}${dataSelector}`);
      }

      // Aria-label selector
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) {
        selectors.push(`${tagName}[aria-label="${ariaLabel}"]`);
      }

      // Text content selector for buttons and links
      if (['button', 'a'].includes(tagName) && element.textContent) {
        const text = element.textContent.trim().substring(0, 50);
        selectors.push(`${tagName}:contains("${text}")`);
      }

      // Input-specific selectors
      if (tagName === 'input') {
        const type = element.getAttribute('type') || 'text';
        const name = element.getAttribute('name');
        if (name) {
          selectors.push(`input[name="${name}"]`);
        } else {
          selectors.push(`input[type="${type}"]`);
        }
      }

      // Use the first selector or fallback to tag name
      const selector = selectors[0] || tagName;

      // Collect attributes
      const attributes: Record<string, string> = {};
      [
        'id',
        'class',
        'name',
        'type',
        'href',
        'aria-label',
        'aria-description',
        'role',
        'title',
        'data-tooltip',
        'data-tip',
        'data-original-title',
        'data-testid',
        'placeholder',
        'alt',
        'value',
      ].forEach((attrName) => {
        const attrValue = element.getAttribute(attrName);
        if (attrValue) {
          attributes[attrName] = attrValue;
        }
      });

      const elementInfo = {
        selector,
        tagName,
        text: element.textContent?.trim().substring(0, 100) || '',
        attributes,
        boundingRect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        },
      };

      // Capture any typed text before the click
      let typedText: string | undefined;
      let typedInElement: HTMLElement | null = null;

      if (keystrokeBuffer.length > 0) {
        typedText = keystrokeBuffer.join('');
        typedInElement = currentInputElement;
        keystrokeBuffer = [];
        currentInputElement = null;
      }

      // Send the captured element info
      try {
        chrome.runtime.sendMessage({
          type: 'ELEMENT_SELECTION',
          elementInfo,
          url: window.location.href,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          needsScreenshot: true,
          clickCoordinates: { x: event.clientX, y: event.clientY },
          typedText,
          typedInElement: typedInElement
            ? {
                tagName: typedInElement.tagName.toLowerCase(),
                selector: typedInElement.id
                  ? `#${typedInElement.id}`
                  : getClassName(typedInElement)
                  ? `${typedInElement.tagName.toLowerCase()}.${getClassName(typedInElement).trim().split(/\s+/).join('.')}`
                  : typedInElement.tagName.toLowerCase(),
                name:
                  typedInElement.getAttribute('name') ||
                  typedInElement.getAttribute('placeholder') ||
                  typedInElement.getAttribute('aria-label') ||
                  ''
              }
            : undefined,
        });
      } catch (error) {
        // Ignore send errors
      }

      // Simulate the actual click after a delay
      setTimeout(() => {
        try {
          if (element instanceof HTMLElement) {
            element.click();
          } else {
            const clickEvent = new MouseEvent('click', {
              view: window,
              bubbles: true,
              cancelable: true
            });
            element.dispatchEvent(clickEvent);
          }
        } catch (error) {
          // Ignore click errors
        } finally {
          isProcessing = false;
        }
      }, 300);
    } catch (error) {
      isProcessing = false;
    } finally {
      // Clean up listeners after capturing one click
      document.removeEventListener('click', clickListener, true);
      document.removeEventListener('keydown', escapeListener, true);
      chrome.runtime.onMessage.removeListener(cancelListener);
      win.__clickListenerActive = false;
    }
  };

  // Escape listener - allows user to cancel selection
  const escapeListener = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      chrome.runtime.sendMessage({
        type: 'ELEMENT_SELECTION',
        cancelled: true,
      });
      document.removeEventListener('click', clickListener, true);
      document.removeEventListener('keydown', escapeListener, true);
      document.removeEventListener('keydown', keystrokeListener, true);
      document.removeEventListener('focus', focusListener, true);
      chrome.runtime.onMessage.removeListener(cancelListener);
      win.__clickListenerActive = false;
      win.__keystrokeListenersActive = false;
    }
  };

  // Attach listeners
  document.addEventListener('click', clickListener, true);
  document.addEventListener('keydown', escapeListener, true);
}

// Export singleton instance
export const elementSelectorInjector = ElementSelectorInjector.getInstance();

// Helper function to check if URL is valid for recording
export const isValidUrl = (url?: string): boolean => {
  if (!url) return false;
  return !(
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://') ||
    url.startsWith('brave://')
  );
};
