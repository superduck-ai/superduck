import { isRecord } from '../../messageTypes';

export interface JavaScriptToolInput {
  action: string;
  text: string;
  tabId?: number;
}

export interface NavigateToolInput {
  url: string;
  tabId?: number;
  newTab?: boolean;
}

export interface TabsCreateToolInput {
  url?: string;
  tabId?: number;
}

export interface FindToolInput {
  query: string;
  tabId?: number;
}

export interface GetPageTextToolInput {
  tabId?: number;
  max_chars?: number;
  /** Output format: 'text' (plain textContent, default) or 'html' (raw innerHTML). */
  format?: 'text' | 'html';
}

export interface ReadPageToolInput {
  filter?: 'interactive' | 'all';
  tabId?: number;
  depth?: number;
  ref_id?: string;
  max_chars?: number;
  selector?: string;
  diff?: boolean;
  urls?: boolean;
}

export interface ResizeWindowToolInput {
  width?: number;
  height?: number;
  tabId?: number;
}

export interface UpdatePlanToolInput {
  domains: string[];
  approach: string[];
}

export interface ReadConsoleMessagesToolInput {
  tabId?: number;
  onlyErrors?: boolean;
  clear?: boolean;
  pattern?: string;
  limit?: number;
}

export interface ReadNetworkRequestsToolInput {
  tabId?: number;
  urlPattern?: string;
  clear?: boolean;
  limit?: number;
}

export type EmptyToolInput = Record<string, never>;

export interface MainTextScriptResult {
  text: string;
  /** The format the result was extracted in: 'text' | 'html'. Optional for backward compatibility (old scripts omit it). */
  format?: 'text' | 'html';
  source: string;
  title: string;
  url: string;
  error?: string;
}

export interface ViewportDimensions {
  width: number;
  height: number;
}

export interface ReadPageScriptResult {
  pageContent: string;
  viewport: ViewportDimensions;
  error?: string;
}

export { isRecord };

export function getScriptErrorMessage(error: unknown): string {
  return isRecord(error) && typeof error.message === 'string' ? error.message : 'Unknown error';
}

export function isViewportDimensions(value: unknown): value is ViewportDimensions {
  return isRecord(value) && typeof value.width === 'number' && typeof value.height === 'number';
}

export function isMainTextScriptResult(value: unknown): value is MainTextScriptResult {
  return (
    isRecord(value) &&
    typeof value.text === 'string' &&
    (value.format === undefined || value.format === 'text' || value.format === 'html') &&
    typeof value.source === 'string' &&
    typeof value.title === 'string' &&
    typeof value.url === 'string' &&
    (value.error === undefined || typeof value.error === 'string')
  );
}

export function isReadPageScriptResult(value: unknown): value is ReadPageScriptResult {
  return (
    isRecord(value) &&
    typeof value.pageContent === 'string' &&
    isViewportDimensions(value.viewport) &&
    (value.error === undefined || typeof value.error === 'string')
  );
}
