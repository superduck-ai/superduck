import { isRecord } from '../../messageTypes';

export interface FileUploadToolInput {
  paths: string[];
  ref?: string;
  coordinate?: [number, number];
  tabId?: number;
}

export interface UploadImageToolInput {
  imageId: string;
  ref?: string;
  coordinate?: [number, number];
  tabId?: number;
  filename?: string;
}

export interface GifAction {
  type: string;
  [key: string]: unknown;
}

export interface GifCreatorToolInput {
  action: 'start_recording' | 'stop_recording' | 'export' | 'clear';
  tabId: number;
  coordinate?: [number, number];
  download?: boolean;
  filename?: string;
  options?: {
    showClickIndicators?: boolean;
    showDragPaths?: boolean;
    showActionLabels?: boolean;
    showProgressBar?: boolean;
    showWatermark?: boolean;
    quality?: number;
  };
}

export interface GifGenerationResult {
  base64: string;
  blobUrl: string;
  size: number;
  width: number;
  height: number;
}

export interface ScriptOutputResult {
  error?: string;
  output?: string;
}

export interface ScriptSuccessResult extends ScriptOutputResult {
  success?: boolean;
}

export { isRecord };

export function isScriptOutputResult(value: unknown): value is ScriptOutputResult {
  return (
    isRecord(value) &&
    (value.output === undefined || typeof value.output === 'string') &&
    (value.error === undefined || typeof value.error === 'string')
  );
}

export function isScriptSuccessResult(value: unknown): value is ScriptSuccessResult {
  return (
    isRecord(value) &&
    (value.output === undefined || typeof value.output === 'string') &&
    (value.error === undefined || typeof value.error === 'string') &&
    (value.success === undefined || typeof value.success === 'boolean')
  );
}

export function parseDimension(text: string, dimension: 'width' | 'height'): number | undefined {
  if (!text) return;
  const match = text.match(/\((\d+)x(\d+)/);
  if (!match) return;
  return 'width' === dimension ? parseInt(match[1], 10) : parseInt(match[2], 10);
}
