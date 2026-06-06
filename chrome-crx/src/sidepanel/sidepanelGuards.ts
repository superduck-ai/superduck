import { useEffect, useState } from 'react';
import {
  isImageContentBlock,
  isRecord,
  isTextContentBlock,
  type ApiConversationMessage,
  type ApiToolResultBlock,
  type ApiToolResultContentBlock
} from '../messageTypes';
import { isPermissionMode } from './sidepanelUtils';
import type { ChatMessage, ChatRole, SessionSnapshot, SupportedImageMediaType } from './types';

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

// ─── Utility Functions ────────────────────────────────────────────────────────

export function getLightningScreenshotReminder(width: number, height: number): string {
  return `<system-reminder>The attached screenshot is ${width}x${height}. For C/RC/DC/TC/H/S/D/Z, use pixel coordinates from this screenshot with origin (0,0) at the image's top-left. Recompute coordinates after every new screenshot. Do not use DOM, CSS, or viewport coordinates.</system-reminder>`;
}

export function normalizeToolResultContent(
  content: ApiConversationMessage['content'] | undefined,
  fallback: string
): ApiToolResultBlock['content'] {
  if (typeof content === 'string') {
    return content || fallback;
  }
  if (!Array.isArray(content)) {
    return fallback;
  }
  const filtered = content.filter(
    (block): block is ApiToolResultContentBlock =>
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
export const CUSTOM_API_URL_KEY = 'customApiUrl';
export const CUSTOM_API_KEY_KEY = 'customApiKey';

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
