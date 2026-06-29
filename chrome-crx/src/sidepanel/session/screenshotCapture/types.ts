export interface ScreenshotRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface CapturedScreenshotAttachment {
  id: string;
  file: File;
  base64: string;
  url: string;
  isAnnotated?: boolean;
}

interface ScreenshotSelectionMessage {
  type: 'SCREENSHOT_SELECTION';
  cancelled?: boolean;
  fullPage?: boolean;
  region?: ScreenshotRegion;
}

interface CancelScreenshotOverlayMessage {
  type: 'CANCEL_SCREENSHOT_OVERLAY';
}

type ScreenshotOverlayMessage = ScreenshotSelectionMessage | CancelScreenshotOverlayMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isScreenshotRegion(value: unknown): value is ScreenshotRegion {
  return (
    isRecord(value) &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    (value.viewportWidth === undefined || typeof value.viewportWidth === 'number') &&
    (value.viewportHeight === undefined || typeof value.viewportHeight === 'number')
  );
}

export function isScreenshotOverlayMessage(message: unknown): message is ScreenshotOverlayMessage {
  return (
    isRecord(message) &&
    (message.type === 'SCREENSHOT_SELECTION' || message.type === 'CANCEL_SCREENSHOT_OVERLAY')
  );
}
