import { getStorageValue, removeStorageValues, setStorageValue, StorageKeys } from './core';

const ANALYTICS_ID_WAIT_MS = 300;

let analyticsIdPromise: Promise<string> | null = null;

function createInstallAnalyticsId(): string {
  return `sdid-${crypto.randomUUID().replace(/-/g, '')}`;
}

function normalizeStoredAnalyticsId(id: string | undefined): string | undefined {
  const trimmed = id?.trim();
  if (!trimmed || trimmed.startsWith('anon-') || trimmed.startsWith('sdext-')) return undefined;
  return trimmed;
}

async function readAndCleanStoredAnalyticsId(): Promise<string | undefined> {
  const rawAnalyticsId = await getStorageValue<string>(StorageKeys.ANALYTICS_ID);
  const rawAnonymousId = await getStorageValue<string>(StorageKeys.ANONYMOUS_ID);
  const normalized =
    normalizeStoredAnalyticsId(rawAnalyticsId) ?? normalizeStoredAnalyticsId(rawAnonymousId);

  if (!normalized && (rawAnalyticsId || rawAnonymousId)) {
    await removeStorageValues([StorageKeys.ANALYTICS_ID, StorageKeys.ANONYMOUS_ID]);
  }

  return normalized;
}

export async function getStoredSharedAnalyticsId(): Promise<string | undefined> {
  return readAndCleanStoredAnalyticsId();
}

export async function setSharedAnalyticsId(id: string): Promise<void> {
  const trimmed = id.trim();
  if (!trimmed) return;
  await setStorageValue(StorageKeys.ANALYTICS_ID, trimmed);
  await setStorageValue(StorageKeys.ANONYMOUS_ID, trimmed);
}

async function waitForSharedAnalyticsId(): Promise<string | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value?: string) => {
      if (settled) return;
      settled = true;
      chrome.storage.onChanged.removeListener(listener);
      clearTimeout(timeoutId);
      resolve(value);
    };
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local') return;
      const next =
        normalizeStoredAnalyticsId(
          typeof changes[StorageKeys.ANALYTICS_ID]?.newValue === 'string'
            ? changes[StorageKeys.ANALYTICS_ID]?.newValue
            : undefined
        ) ??
        normalizeStoredAnalyticsId(
          typeof changes[StorageKeys.ANONYMOUS_ID]?.newValue === 'string'
            ? changes[StorageKeys.ANONYMOUS_ID]?.newValue
            : undefined
        );
      if (next) finish(next);
    };
    chrome.storage.onChanged.addListener(listener);
    const timeoutId = setTimeout(() => finish(), ANALYTICS_ID_WAIT_MS);

    readAndCleanStoredAnalyticsId().then((stored) => {
      if (stored) finish(stored);
    });
  });
}

export async function getOrCreateAnonymousId(): Promise<string> {
  if (analyticsIdPromise) return analyticsIdPromise;

  analyticsIdPromise = (async () => {
    let id = await waitForSharedAnalyticsId();
    if (!id) {
      id = createInstallAnalyticsId();
      await setSharedAnalyticsId(id);
    }
    return id;
  })();

  try {
    return await analyticsIdPromise;
  } finally {
    analyticsIdPromise = null;
  }
}
