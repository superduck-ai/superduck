import { useCallback, useEffect, useState } from 'react';
import { getStorageValue, setStorageValue } from '@/extensionServices';

function useStorageState<T>(key: string, defaultValue: T): [T, (value: T) => Promise<void>] {
  const [state, setState] = useState<T>(defaultValue);

  useEffect(() => {
    void getStorageValue(key, defaultValue).then(setState);
  }, [defaultValue, key]);

  useEffect(() => {
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'local' && key in changes) {
        void getStorageValue(key, defaultValue).then(setState);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [defaultValue, key]);

  const setter = useCallback(
    async (value: T) => {
      await setStorageValue(key, value);
    },
    [key]
  );

  return [state, setter];
}

export { useStorageState };
