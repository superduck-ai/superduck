import { getStorageValue, setStorageValue, StorageKeys } from './core';

const NATIVE_HOST_NAMES = [
  'com.me.superduck_browser_extension',
  'com.me.superduck_code_browser_extension'
] as const;

type NativeAnalyticsResponse = {
  type?: string;
  distinct_id?: string;
};

async function getNativeHostAnalyticsId(): Promise<string | null> {
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
      if (distinctId) return distinctId;
    } catch {
      // try next host
    }
  }

  return null;
}

export async function getOrCreateAnonymousId(): Promise<string> {
  let id = await getStorageValue<string>(StorageKeys.ANONYMOUS_ID);
  if (!id) {
    id = (await getNativeHostAnalyticsId()) ?? crypto.randomUUID();
    await setStorageValue(StorageKeys.ANONYMOUS_ID, id);
  }
  return id;
}
