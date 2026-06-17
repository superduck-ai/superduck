import { useEffect, useState } from 'react';
import {
  isImageContentBlock,
  isRecord,
  isTextContentBlock,
  type ApiConversationMessage,
  type ApiImageContentBlock,
  type ApiTextContentBlock,
  type ApiToolResultBlock
} from '../messageTypes';
import { isPermissionMode } from './sidepanelUtils';
import type {
  ChatMessage,
  ChatRole,
  SessionIndexEntry,
  SessionSnapshot,
  SupportedImageMediaType
} from './types';

// ─── Type Guards ──────────────────────────────────────────────────────────────

export function isChatRole(value: unknown): value is ChatRole {
  return value === 'system' || value === 'user' || value === 'assistant';
}

export function isChatMessage(value: unknown): value is ChatMessage {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isChatRole(value.role) &&
    typeof value.text === 'string'
  );
}

export function isApiConversationMessage(value: unknown): value is ApiConversationMessage {
  return (
    isRecord(value) &&
    isChatRole(value.role) &&
    (typeof value.content === 'string' || Array.isArray(value.content))
  );
}

export function isSessionSnapshot(value: unknown): value is SessionSnapshot {
  return (
    isRecord(value) &&
    Array.isArray(value.uiMessages) &&
    value.uiMessages.every(isChatMessage) &&
    Array.isArray(value.apiMessages) &&
    value.apiMessages.every(isApiConversationMessage) &&
    typeof value.selectedModel === 'string' &&
    isPermissionMode(value.permissionMode) &&
    (value.createdAt === undefined || typeof value.createdAt === 'number') &&
    (value.conversationUuid === undefined || typeof value.conversationUuid === 'string') &&
    (value.remoteSessionId === undefined || typeof value.remoteSessionId === 'string')
  );
}

export function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

export function isSessionIndexEntry(value: unknown): value is SessionIndexEntry {
  if (!isRecord(value)) return false;
  if (typeof value.sessionId !== 'string') return false;
  if (typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) return false;
  if (typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)) return false;
  if (
    'conversationUuid' in value &&
    value.conversationUuid !== undefined &&
    typeof value.conversationUuid !== 'string'
  )
    return false;
  if (
    'remoteSessionId' in value &&
    value.remoteSessionId !== undefined &&
    typeof value.remoteSessionId !== 'string'
  )
    return false;
  if ('model' in value && value.model !== undefined && typeof value.model !== 'string')
    return false;
  if ('preview' in value && value.preview !== undefined && typeof value.preview !== 'string')
    return false;
  return true;
}

// ─── Utility Functions ────────────────────────────────────────────────────────

export function getLightningScreenshotReminder(width: number, height: number): string {
  return `<system-reminder>The attached screenshot is ${width}x${height}. For C/RC/DC/TC/H/S/D/Z, use pixel coordinates from this screenshot with origin (0,0) at the image's top-left. Recompute coordinates after every new screenshot. Do not use DOM, CSS, or viewport coordinates.</system-reminder>`;
}

export function normalizeToolResultContent(
  content: ApiToolResultBlock['content'] | undefined,
  fallback: string
): ApiToolResultBlock['content'] {
  if (typeof content === 'string') {
    return content || fallback;
  }
  if (!Array.isArray(content)) {
    return fallback;
  }
  const filtered = content.filter(
    (block): block is ApiTextContentBlock | ApiImageContentBlock =>
      isTextContentBlock(block) || isImageContentBlock(block)
  );
  return filtered.length > 0 ? filtered : fallback;
}

export function getStreamHeaders(stream: unknown): Headers | null {
  if (!isRecord(stream) || !isRecord(stream.response)) return null;
  return stream.response.headers instanceof Headers ? stream.response.headers : null;
}

export function getRuntimeEvaluateValue(result: unknown): boolean {
  return isRecord(result) && isRecord(result.result) && result.result.value === true;
}

export function normalizeImageMediaType(mediaType: string | undefined): SupportedImageMediaType {
  if (
    mediaType === 'image/jpeg' ||
    mediaType === 'image/png' ||
    mediaType === 'image/gif' ||
    mediaType === 'image/webp'
  ) {
    return mediaType;
  }

  switch (mediaType) {
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const SESSION_CONVERSATION_MAP_KEY = 'sidepanel_conversation_map_v1';
export const SESSION_REMOTE_MAP_KEY = 'sidepanel_conversation_remote_map_v1';
export const SESSION_INDEX_KEY = 'sidepanel_session_index_v1';
export const TAB_SESSION_KEY_PREFIX = 'sidepanel_tab_session_';
export const LAST_ACTIVE_SESSION_KEY = 'sidepanel_last_active_session_v1';
export const CUSTOM_API_URL_KEY = 'customApiUrl';
export const CUSTOM_API_KEY_KEY = 'customApiKey';

/**
 * Get the storage key for the last session ID associated with a tab.
 */
export function getTabSessionKey(tabId: number): string {
  return `${TAB_SESSION_KEY_PREFIX}${tabId}`;
}

/**
 * Returns the storage keys to remove so a deleted session is no longer
 * referenced by the tab→session alias map or the global last-active key.
 *
 * Storage is scanned in-process; the function never deletes anything itself
 * so the caller can batch the removal with its other delete operations.
 */
export async function collectTabSessionKeysToRemove(sessionId: string): Promise<string[]> {
  const keys: string[] = [];
  try {
    // chrome.storage.local exposes the full keys list via getKeys() in
    // Chrome 130+; fall back to Object.keys on the full data bag for
    // older targets and test harnesses.
    const all = await new Promise<Record<string, unknown> | string[]>((resolve) => {
      const cb = (items: Record<string, unknown>) => resolve(items);
      chrome.storage.local.get(null, cb);
    });
    const allKeys = Array.isArray(all) ? (all as string[]) : Object.keys(all);
    for (const key of allKeys) {
      if (key.startsWith(TAB_SESSION_KEY_PREFIX)) {
        const value = Array.isArray(all) ? undefined : (all as Record<string, unknown>)[key];
        if (value === sessionId) {
          keys.push(key);
        }
      }
    }
  } catch {
    // Storage scan is best-effort. If the platform cannot enumerate keys
    // (e.g. some Web extensions shims), the caller still removes the
    // known snapshot/index entries.
  }
  return keys;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Lightweight external store for streaming text — allows only the streaming
 * text component to re-render on each rAF, instead of the entire MessageList.
 */
export function createStreamingTextStore() {
  let text = '';
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => text,
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    set: (value: string) => {
      if (value !== text) {
        text = value;
        listeners.forEach((cb) => cb());
      }
    }
  };
}

export function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);

    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  return prefersReducedMotion;
}
