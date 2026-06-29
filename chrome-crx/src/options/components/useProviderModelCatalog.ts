import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { fetchProviderModelCatalog } from '@/utils/providerModelCatalog';
import {
  isValidProviderBaseURL,
  normalizeProviderBaseURL,
  type ProviderKind,
  type ProviderModelMetadata
} from '@/utils/providerStore';

export interface UseProviderModelCatalogOptions {
  isOpen: boolean;
  kind: ProviderKind;
  apiKey: string;
  baseURL: string;
  modelId: string;
}

export interface UseProviderModelCatalogReturn {
  modelOptions: string[];
  modelMetadata: Record<string, ProviderModelMetadata>;
  modelDropdownOpen: boolean;
  setModelDropdownOpen: (open: boolean) => void;
  isLoadingModels: boolean;
  filteredModelOptions: string[];
  modelInputContainerRef: RefObject<HTMLDivElement | null>;
  resetCatalog: () => void;
}

export function useProviderModelCatalog({
  isOpen,
  kind,
  apiKey,
  baseURL,
  modelId
}: UseProviderModelCatalogOptions): UseProviderModelCatalogReturn {
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelMetadata, setModelMetadata] = useState<Record<string, ProviderModelMetadata>>({});
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const modelInputContainerRef = useRef<HTMLDivElement>(null);

  const resetCatalog = useCallback(() => {
    setModelOptions([]);
    setModelMetadata({});
    setModelDropdownOpen(false);
    setIsLoadingModels(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const clearModels = () => {
      setModelOptions([]);
      setModelMetadata({});
      setModelDropdownOpen(false);
      setIsLoadingModels(false);
    };

    const trimmedApiKey = apiKey.trim();
    const trimmedBaseURL = baseURL.trim();
    if (!trimmedApiKey && !trimmedBaseURL) {
      clearModels();
      return;
    }
    if (trimmedBaseURL && !isValidProviderBaseURL(baseURL)) {
      clearModels();
      return;
    }

    let cancelled = false;
    setModelOptions([]);
    setModelMetadata({});
    setModelDropdownOpen(false);
    setIsLoadingModels(true);

    const timer = window.setTimeout(() => {
      void fetchProviderModelCatalog({
        kind,
        apiKey: trimmedApiKey,
        baseURL: normalizeProviderBaseURL(kind, baseURL)
      })
        .then((catalog) => {
          if (!cancelled) {
            setModelOptions(catalog.models);
            setModelMetadata(catalog.metadata);
            setIsLoadingModels(false);
          }
        })
        .catch(() => {
          if (!cancelled) clearModels();
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [apiKey, baseURL, isOpen, kind]);

  useEffect(() => {
    if (!modelDropdownOpen) return;
    const handler = (event: MouseEvent) => {
      if (
        modelInputContainerRef.current &&
        !modelInputContainerRef.current.contains(event.target as Node)
      ) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelDropdownOpen]);

  const filteredModelOptions = useMemo(() => {
    const normalizedModelId = modelId.trim().toLowerCase();
    if (!normalizedModelId) return modelOptions;
    const filtered = modelOptions.filter((model) =>
      model.toLowerCase().includes(normalizedModelId)
    );
    return filtered.length > 0 ? filtered : modelOptions;
  }, [modelId, modelOptions]);

  return {
    modelOptions,
    modelMetadata,
    modelDropdownOpen,
    setModelDropdownOpen,
    isLoadingModels,
    filteredModelOptions,
    modelInputContainerRef,
    resetCatalog
  };
}
