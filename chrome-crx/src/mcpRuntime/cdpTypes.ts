export interface KeyDefinition {
  key: string;
  code: string;
  keyCode: number;
  text?: string;
  isKeypad?: boolean;
  location?: number;
  windowsVirtualKeyCode?: number;
}

export interface ConsoleMessage {
  type: string;
  text: string;
  timestamp: number;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  args?: any[];
  stackTrace?: string;
}

export interface ConsoleTabData {
  domain: string;
  messages: ConsoleMessage[];
}

export interface NetworkRequest {
  requestId: string;
  url: string;
  method: string;
  status?: number;
}

export interface NetworkTabData {
  domain: string;
  requests: NetworkRequest[];
  requestMap: Map<string, NetworkRequest>;
}

export interface MouseEventParams {
  type: string;
  x: number;
  y: number;
  button?: string;
  buttons?: number;
  clickCount?: number;
  modifiers?: number;
  deltaX?: number;
  deltaY?: number;
}

export interface KeyEventParams {
  type: string;
  key?: string;
  code?: string;
  windowsVirtualKeyCode?: number;
  modifiers?: number;
  text?: string;
  unmodifiedText?: string;
  location?: number;
  commands?: string[];
  isKeypad?: boolean;
}

export interface ResizeParams {
  pxPerToken: number;
  maxTargetPx: number;
  maxTargetTokens: number;
}

export interface ScreenshotResult {
  base64: string;
  width: number;
  height: number;
  format: string;
  viewportWidth: number;
  viewportHeight: number;
}

export interface ScreenshotOptions {
  format?: string;
  quality?: number;
  skipIndicator?: boolean;
}

export interface ClickOptions {
  skipIndicator?: boolean;
}
