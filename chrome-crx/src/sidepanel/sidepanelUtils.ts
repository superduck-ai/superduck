import type { ModelOptionConfig, ModelsConfigFeatureValue } from '../extensionServices';
import { isImageContentBlock, isRecord, isTextContentBlock } from '../messageTypes';
import type { Base64ImageBlock, Base64ImageSource } from './types';

export type PermissionMode = 'skip_all_permission_checks' | 'follow_a_plan';

export interface PromptAttachmentPayload {
  id: string;
  base64: string;
  mediaType: string;
  fileName: string;
  isAnnotated?: boolean;
}

export function createId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function parseTabId(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return value;
}

export function normalizeApiBaseUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
}

export async function openOptionsTo(
  section: 'permissions' | 'prompts' | 'internal' = 'permissions'
) {
  const optionsBaseUrl = chrome.runtime.getURL('options.html');
  const targetUrl = chrome.runtime.getURL(`options.html#${section}`);
  const tabs = await chrome.tabs.query({});
  const existingTab = tabs.find(
    (tab) => typeof tab.url === 'string' && tab.url.startsWith(optionsBaseUrl)
  );

  if (existingTab?.id) {
    await chrome.tabs.update(existingTab.id, { url: targetUrl, active: true });
    if (existingTab.windowId) {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url: targetUrl });
}

function isModelOptionConfig(option: unknown): option is ModelOptionConfig {
  return (
    !!option &&
    typeof option === 'object' &&
    typeof (option as ModelOptionConfig).model === 'string'
  );
}

export function getModelDisplayName(
  model: string,
  config: ModelsConfigFeatureValue | null | undefined
): string {
  if (Array.isArray(config?.options)) {
    for (const option of config.options) {
      if (isModelOptionConfig(option) && option.model === model && option.name) {
        return option.name;
      }
    }
  }

  const fallback = config?.modelFallbacks?.[model];
  if (fallback && typeof fallback.currentModelName === 'string' && fallback.currentModelName) {
    return fallback.currentModelName;
  }

  const match = model.match(/claude-(sonnet|opus|haiku)-(\d+(?:\.\d+)?)/i);
  if (match) {
    const family = match[1].toLowerCase();
    if (family === 'opus') return `Deep (${match[2]})`;
    if (family === 'haiku') return `Flash (${match[2]})`;
    return `Smart (${match[2]})`;
  }

  return model;
}

export function isPermissionMode(value: unknown): value is PermissionMode {
  return value === 'skip_all_permission_checks' || value === 'follow_a_plan';
}

export function decodeBase64ToFile(payload: PromptAttachmentPayload): File | null {
  try {
    const binary = atob(payload.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const blob = new Blob([bytes], { type: payload.mediaType });
    return new File([blob], payload.fileName, { type: payload.mediaType });
  } catch {
    return null;
  }
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const marker = 'base64,';
      const markerIndex = result.indexOf(marker);
      if (markerIndex < 0) {
        reject(new Error('Unsupported file encoding'));
        return;
      }
      resolve(result.slice(markerIndex + marker.length));
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ─── Image / block utility functions ──────────────────────────────────────────

export function isBase64ImageSource(source: unknown): source is Base64ImageSource {
  return (
    isRecord(source) &&
    source.type === 'base64' &&
    typeof source.media_type === 'string' &&
    typeof source.data === 'string'
  );
}

export function isBase64ImageBlock(block: unknown): block is Base64ImageBlock {
  return isImageContentBlock(block) && isBase64ImageSource(block.source);
}

export function getTextFromBlockContent(
  content: string | readonly unknown[] | null | undefined,
  separator: string = '\n'
): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(isTextContentBlock)
    .map((block) => block.text)
    .join(separator);
}

export function getBase64ImageBlocks(
  content: readonly unknown[] | null | undefined
): Base64ImageBlock[] {
  if (!Array.isArray(content)) return [];
  return content.filter(isBase64ImageBlock);
}
