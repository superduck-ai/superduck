import { useEffect } from 'react';
import {
  loadProviderConfig,
  PROVIDER_CONFIG_BROADCAST,
  PROVIDER_STORAGE_KEYS
} from '../../utils/providerStore';

export interface UseProviderConfigLoaderProps {
  setProviderConfig: (config: any) => void;
}

/**
 * useProviderConfigLoader — Provider 配置加载
 * 加载并监听 provider config 变化
 */
export function useProviderConfigLoader({ setProviderConfig }: UseProviderConfigLoaderProps) {
  // Load provider config (drives the flat model picker) and keep it fresh.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const config = await loadProviderConfig();
      if (!cancelled) setProviderConfig(config);
    };
    void load();
    const storageListener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      if (PROVIDER_STORAGE_KEYS.PROVIDERS in changes) void load();
    };
    const runtimeListener = (message: unknown) => {
      if (
        message &&
        typeof message === 'object' &&
        (message as { type?: string }).type === PROVIDER_CONFIG_BROADCAST
      ) {
        void load();
      }
    };
    chrome.storage.onChanged.addListener(storageListener);
    chrome.runtime.onMessage.addListener(runtimeListener);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(storageListener);
      chrome.runtime.onMessage.removeListener(runtimeListener);
    };
  }, [setProviderConfig]);
}
