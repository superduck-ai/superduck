import type { CapturedEvent as InjectedCapturedEvent } from '../elementSelectorInjector';
import type { CapturedEvent } from './types';

export function normalizeCapturedEvent(event: InjectedCapturedEvent): CapturedEvent {
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
