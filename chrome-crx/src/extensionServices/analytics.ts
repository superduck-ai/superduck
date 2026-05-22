import { getStorageValue, setStorageValue, StorageKeys } from './core';

let anonymousIdPromise: Promise<string> | null = null;

export async function getOrCreateAnonymousId(): Promise<string> {
  if (anonymousIdPromise) return anonymousIdPromise;

  anonymousIdPromise = (async () => {
    let id = await getStorageValue<string>(StorageKeys.ANONYMOUS_ID);
    if (!id) {
      id = `anon-${crypto.randomUUID()}`;
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
