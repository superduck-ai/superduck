import { useCallback, useEffect, useState } from 'react';
import { StorageKeys, getStorageValue, setStorageValue } from '../../extensionServices';
import { CUSTOM_API_KEY_KEY, CUSTOM_API_URL_KEY } from '../sidepanelGuards';
import { normalizeApiBaseUrl } from '../sidepanelUtils';
import { getErrorMessage } from '../messageProcessing';

export interface UseAuthProps {
  queryApiKey?: string;
  queryApiUrl?: string;
}

export interface UseAuthReturn {
  apiKey: string;
  apiBaseUrl: string;
  authLoading: boolean;
  authError: string | null;
  refreshAuth: () => Promise<void>;
}

export function useAuth({ queryApiKey, queryApiUrl }: UseAuthProps): UseAuthReturn {
  const [authLoading, setAuthLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshAuth = useCallback(async () => {
    setAuthLoading(true);
    try {
      const [keyResult, storedCustomApiUrlResult, storedCustomApiKeyResult] =
        await Promise.allSettled([
          getStorageValue(StorageKeys.API_KEY, ''),
          getStorageValue(CUSTOM_API_URL_KEY, ''),
          getStorageValue(CUSTOM_API_KEY_KEY, '')
        ]);
      const key = keyResult.status === 'fulfilled' ? keyResult.value : '';
      const storedCustomApiUrl =
        storedCustomApiUrlResult.status === 'fulfilled' ? storedCustomApiUrlResult.value : '';
      const storedCustomApiKey =
        storedCustomApiKeyResult.status === 'fulfilled' ? storedCustomApiKeyResult.value : '';
      const normalizedStoredApiUrl =
        normalizeApiBaseUrl(
          typeof storedCustomApiUrl === 'string'
            ? storedCustomApiUrl
            : String(storedCustomApiUrl || '')
        ) || '';
      const resolvedApiBaseUrl = queryApiUrl || normalizedStoredApiUrl || '';
      const resolvedApiKey =
        queryApiKey ||
        (typeof storedCustomApiKey === 'string' ? storedCustomApiKey.trim() : '') ||
        (typeof key === 'string' ? key.trim() : '');

      setApiBaseUrl(resolvedApiBaseUrl);
      setApiKey(resolvedApiKey);
      setAuthError(null);
    } catch (error) {
      setAuthError(getErrorMessage(error));
      setApiKey('');
      setApiBaseUrl('');
    } finally {
      setAuthLoading(false);
    }
  }, [queryApiKey, queryApiUrl]);

  useEffect(() => {
    void refreshAuth();
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      if (
        StorageKeys.API_KEY in changes ||
        CUSTOM_API_URL_KEY in changes ||
        CUSTOM_API_KEY_KEY in changes
      ) {
        void refreshAuth();
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [refreshAuth]);

  useEffect(() => {
    if (queryApiUrl) {
      void setStorageValue(CUSTOM_API_URL_KEY, queryApiUrl);
    }
    if (queryApiKey) {
      void setStorageValue(CUSTOM_API_KEY_KEY, queryApiKey);
    }
  }, [queryApiKey, queryApiUrl]);

  return {
    apiKey,
    apiBaseUrl,
    authLoading,
    authError,
    refreshAuth
  };
}
