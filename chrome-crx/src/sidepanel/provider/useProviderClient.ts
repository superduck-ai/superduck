import { useState, useMemo, useEffect, useRef, type MutableRefObject } from 'react';
import { DEFAULT_MODEL } from '../../constants/models';
import { MessagesClient } from '../../mcpServersStore';
import { resolveEffectiveContextWindow } from '../contextWindow';
import { CONTEXT_WINDOW } from '../messageLimits';
import {
  PROVIDER_CONFIG_BROADCAST,
  PROVIDER_STORAGE_KEYS,
  classifyTier,
  loadProviderConfig,
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
  // Context length saved on the provider bound to the active tier (captured at
  // config time). Undefined until the provider config resolves.
  const [providerContextLength, setProviderContextLength] = useState<number | undefined>(undefined);
  const serverContextLengthRef = useRef<number>(CONTEXT_WINDOW);

  // Resolve the bound provider's saved context length for the active tier.
  // Authoritative — no runtime /v1/models call (the value is captured at save
  // time via fetchProviderModelCatalog). Re-resolves when the model switches or
  // the provider config changes (Options save broadcasts + storage events).
  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      const config = await loadProviderConfig(true);
      if (cancelled) return;
      const tier = classifyTier(activeModel);
      const resolved = resolveTier(config, tier);
      setProviderContextLength(resolved?.provider.contextLength);
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
  }, [activeModel]);

  useEffect(() => {
    const contextLength = resolveEffectiveContextWindow({
      modelId: activeModel,
      providerContextLength
    });
    serverContextLengthRef.current = contextLength;
    setServerModelInfo({ id: activeModel, contextLength });
  }, [activeModel, providerContextLength]);

  return {
    effectiveMessagesClient,
    hasProviderConfig,
    serverModelInfo,
    serverContextLengthRef
  };
}
