import { useCallback, useEffect, useState } from 'react';
import { getStorageValue, setStorageValue } from '@/extensionServices';

function useStorageState<T>(key: string, defaultValue: T): [T, (value: T) => Promise<void>] {
  const [state, setState] = useState<T>(defaultValue);

  useEffect(() => {
    getStorageValue(key).then((value: any) => {
      if (value !== undefined) {
        setState(value);
      }
    });
  }, [key]);

  useEffect(() => {
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'local' && key in changes) {
        setState(changes[key].newValue as T);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [key]);

  const setter = useCallback(
    async (value: T) => {
      await setStorageValue(key, value);
    },
    [key]
  );

  return [state, setter];
}

export { useStorageState };
