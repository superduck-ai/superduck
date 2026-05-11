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
  args?: unknown[];
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

export interface CdpRemoteObject {
  type?: string;
  subtype?: string;
  value?: unknown;
  description?: string;
  objectId?: string;
}

export interface CdpExceptionCallFrame {
  functionName?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface CdpExceptionDetails {
  exception?: {
    description?: string;
    value?: unknown;
  };
  text?: string;
  timestamp?: number;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  stackTrace?: {
    callFrames?: CdpExceptionCallFrame[];
  };
}

export interface CdpRuntimeEvaluateResult {
  result?: CdpRemoteObject;
  exceptionDetails?: CdpExceptionDetails;
}

export interface CdpDomNode {
  nodeName?: string;
  nodeType?: number;
  nodeId?: number;
  backendNodeId?: number;
  frameId?: string;
  children?: CdpDomNode[];
  contentDocument?: CdpDomNode & { frameId?: string };
}

export interface CdpDomGetDocumentResult {
  root?: CdpDomNode;
}

export interface CdpDomDescribeNodeResult {
  node?: CdpDomNode;
}

export interface CdpDomQuerySelectorAllResult {
  nodeIds?: number[];
}

export interface CdpDomQuerySelectorResult {
  nodeId?: number;
}

export interface CdpDomAttributesResult {
  attributes?: string[];
}

export interface CdpDomResolveNodeResult {
  object?: CdpRemoteObject;
}

export interface CdpPageFrameTreeNode {
  frame?: { id?: string };
  childFrames?: CdpPageFrameTreeNode[];
}

export interface CdpPageGetFrameTreeResult {
  frameTree?: CdpPageFrameTreeNode;
}

export interface CdpDomGetFrameOwnerResult {
  backendNodeId?: number;
}

export interface CdpDomGetContentQuadsResult {
  quads?: number[][];
}

export interface CdpAccessibilityTreeResult<TNode = unknown> {
  nodes?: TNode[];
}

export interface CdpCaptureScreenshotResult {
  data?: string;
}
