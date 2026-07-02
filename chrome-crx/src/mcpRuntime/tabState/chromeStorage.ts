// Shared chrome.storage helpers for the tab-state managers (tabLeases,
// tabBadges). They read/write the same session-or-local area; centralizing the
// pick avoids two drift-prone copies.

export type ChromeStorageArea = Pick<chrome.storage.StorageArea, 'get' | 'set' | 'remove'>;

export function getStorageArea(): ChromeStorageArea {
  return chrome.storage.session ?? chrome.storage.local;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
