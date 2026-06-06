import { useCallback, useEffect, useRef, useState } from 'react';
import { StorageKeys, getStorageValue, setStorageValue } from '../../extensionServices';
import {
  PROVIDER_CONFIG_BROADCAST,
  PROVIDER_STORAGE_KEYS,
  loadProviderConfig
} from '../../utils/providerStore';
import { loadModelMapping, MODEL_MAPPING_KEYS } from '../../utils/modelMapping';

export interface UseModelConfigReturn {
  selectedModel: string;
  selectedModelRef: React.MutableRefObject<string>;
  setSelectedModel: (model: string) => void;
  modelMapping: {
    haiku?: string;
    sonnet?: string;
    opus?: string;
  };
  handleModelChange: (nextModel: string) => void;
}

export function useModelConfig(): UseModelConfigReturn {
  const [selectedModel, setSelectedModel] = useState<string>('');
  const selectedModelRef = useRef(selectedModel);
  const [modelMapping, setModelMapping] = useState<{
    haiku?: string;
    sonnet?: string;
    opus?: string;
  }>({});

  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  // Load model mapping on mount
  useEffect(() => {
    loadModelMapping().then(setModelMapping);

    // Listen for storage changes (legacy + new provider config).
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local') return;
      const mappingKeys = Object.values(MODEL_MAPPING_KEYS);
      const touched =
        mappingKeys.some((key) => key in changes) ||
        PROVIDER_STORAGE_KEYS.PROVIDERS in changes ||
        PROVIDER_STORAGE_KEYS.MAPPING in changes;
      if (touched) {
        void loadProviderConfig(true);
        loadModelMapping().then(setModelMapping);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    // Cross-context broadcast (sent by Options on Save).
    const runtimeListener = (message: unknown) => {
      if (
        message &&
        typeof message === 'object' &&
        (message as { type?: string }).type === PROVIDER_CONFIG_BROADCAST
      ) {
        void loadProviderConfig(true);
        loadModelMapping().then(setModelMapping);
      }
    };
    chrome.runtime.onMessage.addListener(runtimeListener);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
      chrome.runtime.onMessage.removeListener(runtimeListener);
    };
  }, []);

  // Load selected model from storage on mount
  useEffect(() => {
    (async () => {
      const model = await getStorageValue(StorageKeys.SELECTED_MODEL, '');
      if (typeof model === 'string' && model) {
        setSelectedModel(model);
      }
    })();
  }, []);

  // Monitor selectedModel changes
  useEffect(() => {
    console.log('[Model State] selectedModel changed to:', selectedModel);
  }, [selectedModel]);

  const handleModelChange = useCallback(
    (nextModel: string) => {
      console.log('[Model Change] Switching to:', nextModel);
      console.log('[Model Change] Current selectedModel:', selectedModel);

      if (!nextModel || nextModel === selectedModel) return;

      setSelectedModel(nextModel);
      void setStorageValue(StorageKeys.SELECTED_MODEL, nextModel);
    },
    [selectedModel]
  );

  return {
    selectedModel,
    selectedModelRef,
    setSelectedModel,
    modelMapping,
    handleModelChange
  };
}
