import { getStorageValue, setStorageValue, StorageKeys } from './core';

const NATIVE_HOST_NAMES = [
  'com.me.superduck_browser_extension',
  'com.me.superduck_code_browser_extension'
] as const;

let nativeIdCache: string | undefined = undefined;

type NativeAnalyticsResponse = {
  type?: string;
  distinct_id?: string;
};

async function getNativeHostAnalyticsId(): Promise<string | null> {
  if (nativeIdCache !== undefined) return nativeIdCache;

  if (typeof chrome.runtime.connectNative !== 'function') return null;
  const hasPermission = await chrome.permissions.contains({ permissions: ['nativeMessaging'] });
  if (!hasPermission) return null;

  for (const hostName of NATIVE_HOST_NAMES) {
    try {
      const response = await new Promise<NativeAnalyticsResponse | null>((resolve) => {
        const port = chrome.runtime.connectNative(hostName);
        let settled = false;
        const timeoutId = setTimeout(() => {
          if (settled) return;
          settled = true;
          try {
            port.disconnect();
          } catch {
            // ignore
          }
          resolve(null);
        }, 3000);

        port.onMessage.addListener((message: NativeAnalyticsResponse) => {
          if (settled) return;
          if (message?.type !== 'analytics_id_response') return;
          settled = true;
          clearTimeout(timeoutId);
          try {
            port.disconnect();
          } catch {
            // ignore
          }
          resolve(message);
        });

        port.onDisconnect.addListener(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          resolve(null);
        });

        port.postMessage({ type: 'get_analytics_id' });
      });

      const distinctId = response?.distinct_id?.trim();
      if (distinctId) {
        nativeIdCache = distinctId;
        return distinctId;
      }
    } catch {
      // try next host
    }
  }

  return null;
}

let anonymousIdPromise: Promise<string> | null = null;

export async function getOrCreateAnonymousId(): Promise<string> {
  if (anonymousIdPromise) return anonymousIdPromise;

  anonymousIdPromise = (async () => {
    let id = await getStorageValue<string>(StorageKeys.ANONYMOUS_ID);
    if (id) {
      if (nativeIdCache === undefined) {
        const nativeId = await getNativeHostAnalyticsId();
        if (nativeId && nativeId !== id) {
          id = nativeId;
          await setStorageValue(StorageKeys.ANONYMOUS_ID, id);
        }
      }
    } else {
      id = (await getNativeHostAnalyticsId()) ?? `anon-${crypto.randomUUID()}`;
      await setStorageValue(StorageKeys.ANONYMOUS_ID, id);
    }
    return id;
  })();

  try {
    return await anonymousIdPromise;
  } finally {
    anonymousIdPromise = null;
  }
}
