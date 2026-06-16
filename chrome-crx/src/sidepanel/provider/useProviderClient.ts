import { useState, useMemo, useEffect, useRef, type MutableRefObject } from 'react';
import { DEFAULT_MODEL } from '../../constants/models';
import { MessagesClient } from '../../mcpServersStore';
import { resolveEffectiveContextWindow } from '../contextWindow';
import { CONTEXT_WINDOW } from '../messageLimits';
import {
  PROVIDER_CONFIG_BROADCAST,
  PROVIDER_STORAGE_KEYS,
  classifyTier,
  fetchProviderModelCatalog,
  loadProviderConfig,
  lookupModelContextLength,
  resolveTier
} from '../../utils/providerStore';

export interface UseProviderClientOptions {
  apiKey: string;
  apiBaseUrl: string;
  selectedModel?: string;
}

export interface ServerModelInfo {
  id: string;
  contextLength: number;
}

export interface UseProviderClientResult {
  effectiveMessagesClient: InstanceType<typeof MessagesClient> | null;
  hasProviderConfig: boolean;
  serverModelInfo: ServerModelInfo | null;
  serverContextLengthRef: MutableRefObject<number>;
}

type ProviderContextInfo =
  | { status: 'pending'; sourceModelId: string }
  | {
      status: 'resolved';
      sourceModelId: string;
      modelId: string;
      contextLength?: number;
    };

export function useProviderClient(options: UseProviderClientOptions): UseProviderClientResult {
  const { apiKey, apiBaseUrl, selectedModel } = options;
  const activeModel = selectedModel || DEFAULT_MODEL;

  const [providerClient, setProviderClient] = useState<InstanceType<typeof MessagesClient> | null>(
    null
  );

  const messagesClient = useMemo(() => {
    if (!apiKey || !apiBaseUrl) return null;
    return new MessagesClient({
      baseURL: apiBaseUrl,
      dangerouslyAllowBrowser: true,
      apiKey
    });
  }, [apiBaseUrl, apiKey]);

  useEffect(() => {
    if (messagesClient) {
      setProviderClient(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { resolveClientForTier } = await import('../../utils/providerClient');
      const resolved = await resolveClientForTier('smart');
      if (cancelled) return;
      if (resolved) {
        setProviderClient(
          new MessagesClient({
            baseURL: resolved.baseURL,
            dangerouslyAllowBrowser: true,
            apiKey: resolved.apiKey
          })
        );
      } else {
        setProviderClient(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messagesClient, apiKey, apiBaseUrl]);

  const effectiveMessagesClient = messagesClient || providerClient;
  const hasProviderConfig = effectiveMessagesClient !== null;

  const [serverModelInfo, setServerModelInfo] = useState<ServerModelInfo | null>(null);
  // Actual provider model bound to the active tier, plus its saved context
  // length captured at config time. Pending state intentionally falls back to
  // the conservative 256k default while provider config resolves.
  const [providerContextInfo, setProviderContextInfo] = useState<ProviderContextInfo>({
    status: 'pending',
    sourceModelId: activeModel
  });
  const serverContextLengthRef = useRef<number>(CONTEXT_WINDOW);

  // Resolve the context length for the active tier. Saved provider mappings use
  // their config-time value; direct apiKey/apiBaseUrl clients fetch their
  // catalog at runtime because they have no saved provider record.
  useEffect(() => {
    let cancelled = false;
    let resolveVersion = 0;
    const resolve = async () => {
      const version = ++resolveVersion;
      setProviderContextInfo({ status: 'pending', sourceModelId: activeModel });
      const config = await loadProviderConfig(true);
      if (cancelled || version !== resolveVersion) return;
      const tier = classifyTier(activeModel);
      const resolved = resolveTier(config, tier);
      if (!resolved && apiKey && apiBaseUrl) {
        let contextLength: number | undefined;
        try {
          const catalog = await fetchProviderModelCatalog({
            kind: 'anthropic',
            apiKey,
            baseURL: apiBaseUrl
          });
          if (cancelled || version !== resolveVersion) return;
          contextLength = lookupModelContextLength(catalog.contextLengths, activeModel);
        } catch {
          if (cancelled || version !== resolveVersion) return;
        }
        setProviderContextInfo({
          status: 'resolved',
          sourceModelId: activeModel,
          modelId: activeModel,
          contextLength
        });
        return;
      }
      setProviderContextInfo({
        status: 'resolved',
        sourceModelId: activeModel,
        modelId: resolved?.modelId ?? activeModel,
        contextLength: resolved?.provider.contextLength
      });
    };
    void resolve();

    const storageListener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      if (PROVIDER_STORAGE_KEYS.MAPPING in changes || PROVIDER_STORAGE_KEYS.PROVIDERS in changes) {
        void resolve();
      }
    };
    const runtimeListener = (message: unknown) => {
      if (
        message &&
        typeof message === 'object' &&
        (message as { type?: string }).type === PROVIDER_CONFIG_BROADCAST
      ) {
        void resolve();
      }
    };
    chrome.storage.onChanged.addListener(storageListener);
    chrome.runtime.onMessage.addListener(runtimeListener);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(storageListener);
      chrome.runtime.onMessage.removeListener(runtimeListener);
    };
  }, [activeModel, apiBaseUrl, apiKey]);

  useEffect(() => {
    const currentInfo =
      providerContextInfo.sourceModelId === activeModel
        ? providerContextInfo
        : ({ status: 'pending', sourceModelId: activeModel } satisfies ProviderContextInfo);
    const modelId = currentInfo.status === 'resolved' ? currentInfo.modelId : activeModel;
    const contextLength =
      currentInfo.status === 'resolved'
        ? resolveEffectiveContextWindow({
            modelId,
            providerContextLength: currentInfo.contextLength
          })
        : CONTEXT_WINDOW;
    serverContextLengthRef.current = contextLength;
    setServerModelInfo({ id: modelId, contextLength });
  }, [activeModel, providerContextInfo]);

  return {
    effectiveMessagesClient,
    hasProviderConfig,
    serverModelInfo,
    serverContextLengthRef
  };
}
