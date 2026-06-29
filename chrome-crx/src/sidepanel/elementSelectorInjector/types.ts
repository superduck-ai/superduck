export interface ElementInfo {
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

export function isCancelElementSelectorMessage(
  message: unknown
): message is CancelElementSelectorMessage {
  return isRecord(message) && message.type === 'CANCEL_ELEMENT_SELECTOR';
}

export function isElementSelectionMessage(message: unknown): message is ElementSelectionMessage {
  return isRecord(message) && message.type === 'ELEMENT_SELECTION';
}
