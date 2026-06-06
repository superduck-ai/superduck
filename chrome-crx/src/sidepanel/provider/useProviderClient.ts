/**
 * Provider client management hook.
 *
 * Encapsulates the creation and lifecycle of LLM provider clients (Anthropic,
 * OpenAI-compatible, etc.). This hook manages:
 *
 * 1. Creating MessagesClient instances based on API key and base URL
 * 2. Falling back to tier-specific provider when direct config is unavailable
 * 3. Tracking whether a provider is configured (for setup gate)
 * 4. Fetching server model info (context_length) from /v1/models endpoint
 *
 * The returned `effectiveMessagesClient` can be passed to `dispatchMessagesClient`
 * as a fallback when no tier-specific provider is configured.
 */
import { useState, useMemo, useEffect, useRef, type MutableRefObject } from 'react';
import { MessagesClient } from '../../mcpServersStore';
import { CONTEXT_WINDOW } from '../messageLimits';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export interface UseProviderClientOptions {
  apiKey: string;
  apiBaseUrl: string;
}

export interface ServerModelInfo {
  id: string;
  contextLength: number;
}

export interface UseProviderClientResult {
  /**
   * The effective client to use for API requests. This is either the primary
   * messagesClient (from apiKey+apiBaseUrl) or a tier-resolved providerClient.
   * Will be null if neither is available.
   */
  effectiveMessagesClient: InstanceType<typeof MessagesClient> | null;

  /**
   * Whether a provider configuration exists (either direct or tier-resolved).
   * Derived from effectiveMessagesClient — true whenever a client is available.
   * Used by SetupGate to show onboarding UI when no provider is configured.
   */
  hasProviderConfig: boolean;

  /**
   * Server-reported model info from /v1/models endpoint.
   * Contains context_length for the gateway's actual context window.
   */
  serverModelInfo: ServerModelInfo | null;

  /**
   * Ref tracking the server's context length (defaults to CONTEXT_WINDOW constant).
   * Updated when /v1/models returns a context_length value.
   */
  serverContextLengthRef: MutableRefObject<number>;
}

/**
 * Hook to manage provider client lifecycle.
 *
 * Extracted from SidepanelApp.tsx lines 4680-4756.
 * Logic:
 * 1. If apiKey + apiBaseUrl provided → create messagesClient directly
 * 2. Otherwise → resolve tier-specific client via resolveClientForTier('smart')
 * 3. Fetch /v1/models to get server's context_length
 */
export function useProviderClient(options: UseProviderClientOptions): UseProviderClientResult {
  const { apiKey, apiBaseUrl } = options;

  const [providerClient, setProviderClient] = useState<InstanceType<typeof MessagesClient> | null>(
    null
  );

  // Memoized client that updates when apiKey or apiBaseUrl changes
  const messagesClient = useMemo(() => {
    if (!apiKey || !apiBaseUrl) return null;
    return new MessagesClient({
      baseURL: apiBaseUrl,
      dangerouslyAllowBrowser: true,
      apiKey
    });
  }, [apiBaseUrl, apiKey]);

  // Effect: if messagesClient exists, clear providerClient.
  // Otherwise, resolve tier-specific client.
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

  // Derived: true whenever any provider client is available (direct or tier-resolved).
  const hasProviderConfig = effectiveMessagesClient !== null;

  // Fetch /v1/models once per (baseURL, credential) so we can use the gateway's
  // real context_length instead of the hard-coded 200k constant.
  const [serverModelInfo, setServerModelInfo] = useState<ServerModelInfo | null>(null);
  const serverContextLengthRef = useRef<number>(CONTEXT_WINDOW);

  useEffect(() => {
    if (!effectiveMessagesClient) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const modelsApi =
          'models' in effectiveMessagesClient ? effectiveMessagesClient.models : null;
        if (!isRecord(modelsApi) || typeof modelsApi.list !== 'function') return;
        const page = await modelsApi.list({}, { signal: ctrl.signal });
        if (!isRecord(page) || !Array.isArray(page.data)) return;
        const first = page.data[0];
        if (
          isRecord(first) &&
          typeof first.id === 'string' &&
          typeof first.context_length === 'number'
        ) {
          serverContextLengthRef.current = first.context_length;
          setServerModelInfo({ id: first.id, contextLength: first.context_length });
        }
      } catch {
        /* ignore — will fall back to default budget */
      }
    })();
    return () => ctrl.abort();
  }, [effectiveMessagesClient]);

  return {
    effectiveMessagesClient,
    hasProviderConfig,
    serverModelInfo,
    serverContextLengthRef
  };
}
