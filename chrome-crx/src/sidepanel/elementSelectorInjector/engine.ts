import type { CapturedEvent } from './types';
import { isCancelElementSelectorMessage, isElementSelectionMessage } from './types';
import { elementSelectorScript } from './injectorScript';

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
            // Injection successful
          }
        }
      );
    });
  }
}

export const elementSelectorInjector = ElementSelectorInjector.getInstance();
