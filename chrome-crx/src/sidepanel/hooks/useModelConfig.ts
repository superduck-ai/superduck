import { useCallback, useEffect, useRef } from 'react';
import { StorageKeys, getStorageValue, setStorageValue } from '../../extensionServices';
import {
  PROVIDER_CONFIG_BROADCAST,
  PROVIDER_STORAGE_KEYS,
  loadProviderConfig
} from '../../utils/providerStore';
import { useModelStore } from '../stores/modelStore';

export interface UseModelConfigReturn {
  selectedModel: string;
  selectedModelRef: React.MutableRefObject<string>;
  setSelectedModel: (model: string) => void;
  handleModelChange: (nextModel: string) => void;
}

export function useModelConfig(): UseModelConfigReturn {
  const selectedModel = useModelStore((s) => s.selectedModel);
  const setSelectedModel = useModelStore((s) => s.setSelectedModel);
  const selectedModelRef = useRef(selectedModel);

  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local') return;
      if (PROVIDER_STORAGE_KEYS.PROVIDERS in changes || PROVIDER_STORAGE_KEYS.MAPPING in changes) {
        void loadProviderConfig(true);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    const runtimeListener = (message: unknown) => {
      if (
        message &&
        typeof message === 'object' &&
        (message as { type?: string }).type === PROVIDER_CONFIG_BROADCAST
      ) {
        void loadProviderConfig(true);
      }
    };
    chrome.runtime.onMessage.addListener(runtimeListener);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
      chrome.runtime.onMessage.removeListener(runtimeListener);
    };
  }, []);

  useEffect(() => {
    (async () => {
      const model = await getStorageValue(StorageKeys.SELECTED_MODEL, '');
      if (typeof model === 'string' && model) {
        setSelectedModel(model);
      }
    })();
  }, [setSelectedModel]);

  const handleModelChange = useCallback(
    (nextModel: string) => {
      if (!nextModel || nextModel === selectedModel) return;
      setSelectedModel(nextModel);
      void setStorageValue(StorageKeys.SELECTED_MODEL, nextModel);
    },
    [selectedModel, setSelectedModel]
  );

  return {
    selectedModel,
    selectedModelRef,
    setSelectedModel,
    handleModelChange
  };
}
