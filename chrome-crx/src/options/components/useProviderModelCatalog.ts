import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from 'react';
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

const MODEL_DROPDOWN_RESULT_LIMIT = 50;

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
  const deferredModelId = useDeferredValue(modelId);

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
    const controller = new AbortController();

    const timer = window.setTimeout(() => {
      setIsLoadingModels(true);
      void fetchProviderModelCatalog(
        {
          kind,
          apiKey: trimmedApiKey,
          baseURL: normalizeProviderBaseURL(kind, baseURL)
        },
        10_000,
        controller.signal
      )
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
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [apiKey, baseURL, isOpen, kind]);

  useEffect(() => {
    if (!modelDropdownOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!modelInputContainerRef.current?.contains(event.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [modelDropdownOpen]);

  const filteredModelOptions = useMemo(() => {
    const normalizedModelId = deferredModelId.trim().toLowerCase();
    const matches = normalizedModelId
      ? modelOptions.filter((model) => model.toLowerCase().includes(normalizedModelId))
      : modelOptions;
    return matches.slice(0, MODEL_DROPDOWN_RESULT_LIMIT);
  }, [deferredModelId, modelOptions]);

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
