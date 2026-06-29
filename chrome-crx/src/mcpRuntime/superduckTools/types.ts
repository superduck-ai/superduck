export interface ActiveContextArgs {
  tabId?: number;
  full?: boolean;
}

export interface BackgroundFetchArgs {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  sourceTabId?: number;
  allowCrossOrigin?: boolean;
}

export interface OpenArgs {
  url?: string;
  newTab?: boolean;
  tabId?: number;
}

export interface ClickArgs {
  selector?: string;
  text?: string;
  tabId?: number;
}

export interface FillArgs {
  selector?: string;
  value?: string;
  tabId?: number;
}

export interface PressArgs {
  key?: string;
  selector?: string;
  tabId?: number;
}

export interface DownloadsArgs {
  query?: string;
  limit?: number;
  state?: string;
}

export interface HistoryArgs {
  query?: string;
  limit?: number;
  from?: string;
  to?: string;
}

export interface ActiveContextScriptResult {
  url?: string;
  title?: string;
  selection?: string;
  text?: string;
}

export interface ToolScriptResult {
  ok: boolean;
  reason?: string;
  tag?: string;
  text?: string;
  value?: string;
  key?: string;
  x?: number;
  y?: number;
}
