import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react';
import {
  CONTEXT_LENGTH_DETECT_DELAY_MS,
  formatContextLengthInput,
  isSameProviderScope,
  normalizeProviderScopeBaseURL,
  parseContextLengthInput,
  type ContextLengthSource
} from './providerEditorHelpers';
import {
  DEFAULT_CONTEXT_LENGTH,
  getPreferredConfiguredModelContextLength
} from '@/constants/models';
import {
  fetchProviderModelCatalog,
  lookupCachedModelMetadata,
  lookupModelMetadata
} from '@/utils/providerModelCatalog';
import {
  isValidProviderBaseURL,
  normalizeProviderBaseURL,
  type AiProvider,
  type ProviderKind,
  type ProviderModelMetadata
} from '@/utils/providerStore';

export interface UseContextLengthResolutionOptions {
  isOpen: boolean;
  provider?: AiProvider | null;
  kind: ProviderKind;
  baseURL: string;
  modelId: string;
  modelMetadata: Record<string, ProviderModelMetadata>;
  apiKey: string;
  submitTokenRef: MutableRefObject<number>;
  isOpenRef: MutableRefObject<boolean>;
}

export interface UseContextLengthResolutionReturn {
  contextLengthInput: string;
  contextLengthSource: ContextLengthSource;
  contextLengthTouched: boolean;
  isResolvingContextLength: boolean;
  setIsResolvingContextLength: Dispatch<SetStateAction<boolean>>;
  parsedContextLength: number | undefined;
  hasInvalidContextLength: boolean;
  handleContextLengthChange: (nextContextLength: string) => void;
  resetContextLengthLookup: (nextModelId?: string) => void;
  resetForOpen: (contextLength?: number) => void;
  resolveContextLengthForSubmit: (
    trimmedModelId: string,
    submitToken: number
  ) => Promise<number | undefined>;
}

export function useContextLengthResolution({
  isOpen,
  provider,
  kind,
  baseURL,
  modelId,
  modelMetadata,
  apiKey,
  submitTokenRef,
  isOpenRef
}: UseContextLengthResolutionOptions): UseContextLengthResolutionReturn {
  const [contextLengthInput, setContextLengthInput] = useState('');
  const [contextLengthSource, setContextLengthSource] = useState<ContextLengthSource>('none');
  const [contextLengthTouched, setContextLengthTouched] = useState(false);
  const [isResolvingContextLength, setIsResolvingContextLength] = useState(false);

  const resetForOpen = useCallback((contextLength?: number) => {
    setContextLengthInput(formatContextLengthInput(contextLength));
    setContextLengthSource(contextLength ? 'saved' : 'none');
    setContextLengthTouched(false);
    setIsResolvingContextLength(false);
  }, []);

  const resetContextLengthLookup = useCallback(
    (nextModelId = modelId) => {
      setContextLengthInput('');
      setContextLengthSource('none');
      setContextLengthTouched(false);
      setIsResolvingContextLength(Boolean(nextModelId.trim()));
    },
    [modelId]
  );

  useEffect(() => {
    if (!isOpen || contextLengthTouched) return;

    const trimmedModelId = modelId.trim();
    if (!trimmedModelId) {
      setContextLengthInput('');
      setContextLengthSource('none');
      setIsResolvingContextLength(false);
      return;
    }
    if (!isValidProviderBaseURL(baseURL)) {
      setContextLengthInput('');
      setContextLengthSource('none');
      setIsResolvingContextLength(false);
      return;
    }

    let cancelled = false;
    const applyContextLength = (value: number, source: ContextLengthSource) => {
      if (cancelled) return;
      setContextLengthInput(formatContextLengthInput(value));
      setContextLengthSource(source);
    };

    const existingContextLength =
      isSameProviderScope(provider, kind, baseURL) &&
      provider?.modelId?.trim() === trimmedModelId &&
      typeof provider?.contextLength === 'number' &&
      provider.contextLength > 0
        ? provider.contextLength
        : undefined;
    if (existingContextLength) {
      const preferredContextLength = getPreferredConfiguredModelContextLength(
        trimmedModelId,
        existingContextLength
      );
      applyContextLength(
        preferredContextLength ?? existingContextLength,
        preferredContextLength === existingContextLength ? 'saved' : 'builtin'
      );
      setIsResolvingContextLength(false);
      return;
    }

    const detectedContextLength = lookupModelMetadata(modelMetadata, trimmedModelId)?.contextLength;
    if (detectedContextLength) {
      const preferredContextLength = getPreferredConfiguredModelContextLength(
        trimmedModelId,
        detectedContextLength
      );
      applyContextLength(
        preferredContextLength ?? detectedContextLength,
        preferredContextLength === detectedContextLength ? 'provider' : 'builtin'
      );
      setIsResolvingContextLength(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setIsResolvingContextLength(true);
      void lookupCachedModelMetadata(
        {
          kind,
          baseURL: normalizeProviderScopeBaseURL(kind, baseURL)
        },
        trimmedModelId
      )
        .then((cachedMetadata) => {
          if (cancelled) return;
          if (cachedMetadata?.contextLength) {
            const preferredContextLength = getPreferredConfiguredModelContextLength(
              trimmedModelId,
              cachedMetadata.contextLength
            );
            applyContextLength(
              preferredContextLength ?? cachedMetadata.contextLength,
              preferredContextLength === cachedMetadata.contextLength ? 'cache' : 'builtin'
            );
            return;
          }
          const builtInContextLength = getPreferredConfiguredModelContextLength(trimmedModelId);
          if (builtInContextLength) {
            applyContextLength(builtInContextLength, 'builtin');
            return;
          }
          applyContextLength(DEFAULT_CONTEXT_LENGTH, 'default');
        })
        .finally(() => {
          if (!cancelled) setIsResolvingContextLength(false);
        });
    }, CONTEXT_LENGTH_DETECT_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    contextLengthTouched,
    baseURL,
    isOpen,
    kind,
    modelMetadata,
    modelId,
    provider?.baseURL,
    provider?.contextLength,
    provider?.kind,
    provider?.modelId
  ]);

  const parsedContextLength = parseContextLengthInput(contextLengthInput);
  const hasInvalidContextLength = Boolean(contextLengthInput.trim()) && !parsedContextLength;

  const handleContextLengthChange = (nextContextLength: string) => {
    setContextLengthInput(nextContextLength);
    setContextLengthSource('manual');
    setContextLengthTouched(true);
  };

  const fetchContextLengthForModel = async (targetModelId: string): Promise<number | undefined> => {
    const trimmedApiKey = apiKey.trim();
    const normalizedBaseURL = normalizeProviderBaseURL(kind, baseURL);
    if (!trimmedApiKey && !normalizedBaseURL) return undefined;
    try {
      const catalog = await fetchProviderModelCatalog({
        kind,
        apiKey: trimmedApiKey,
        baseURL: normalizedBaseURL
      });
      return lookupModelMetadata(catalog.metadata, targetModelId)?.contextLength;
    } catch {
      return undefined;
    }
  };

  const resolveContextLengthForSubmit = async (
    trimmedModelId: string,
    submitToken: number
  ): Promise<number | undefined> => {
    if (!trimmedModelId) return undefined;
    const alreadyDetected = lookupModelMetadata(modelMetadata, trimmedModelId)?.contextLength;
    if (alreadyDetected) {
      return getPreferredConfiguredModelContextLength(trimmedModelId, alreadyDetected);
    }

    setIsResolvingContextLength(true);
    try {
      const fetched = await fetchContextLengthForModel(trimmedModelId);
      if (fetched) return getPreferredConfiguredModelContextLength(trimmedModelId, fetched);
      const cached = await lookupCachedModelMetadata(
        {
          kind,
          baseURL: normalizeProviderScopeBaseURL(kind, baseURL)
        },
        trimmedModelId
      );
      if (cached?.contextLength) {
        return getPreferredConfiguredModelContextLength(trimmedModelId, cached.contextLength);
      }
      const builtInContextLength = getPreferredConfiguredModelContextLength(trimmedModelId);
      if (builtInContextLength) return builtInContextLength;
      const isSameModelAsExisting =
        isSameProviderScope(provider, kind, baseURL) &&
        provider?.modelId?.trim() === trimmedModelId;
      const existingContextLength =
        typeof provider?.contextLength === 'number' && provider.contextLength > 0
          ? provider.contextLength
          : undefined;
      if (isSameModelAsExisting && existingContextLength) {
        return getPreferredConfiguredModelContextLength(trimmedModelId, existingContextLength);
      }
      return DEFAULT_CONTEXT_LENGTH;
    } finally {
      if (submitTokenRef.current === submitToken && isOpenRef.current) {
        setIsResolvingContextLength(false);
      }
    }
  };

  return {
    contextLengthInput,
    contextLengthSource,
    contextLengthTouched,
    isResolvingContextLength,
    setIsResolvingContextLength,
    parsedContextLength,
    hasInvalidContextLength,
    handleContextLengthChange,
    resetContextLengthLookup,
    resetForOpen,
    resolveContextLengthForSubmit
  };
}
