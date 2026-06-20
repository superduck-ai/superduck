import { MessagesClient } from '../mcpServersStore';
import { OAUTH_FALLBACK_MODEL } from '../constants/models';
import {
  DEFAULT_BASE_URL,
  findProvider,
  loadProviderConfig,
  normalizeProviderBaseURL,
  type AiProvider
} from './providerStore';
import { isProviderReadyForSetup } from './providerConfigStatus';
import {
  createAnthropicRuntime,
  createProviderRuntime,
  type ProviderRuntime
} from './providerRuntime';

export interface ResolvedClientConfig {
  baseURL: string;
  apiKey: string;
  modelId: string;
  provider: AiProvider;
}

type AnthropicSdkClient = InstanceType<typeof MessagesClient>;

interface CachedClient {
  cacheKey: string;
  runtime: ProviderRuntime;
}

let cachedDispatchClient: CachedClient | null = null;

function cacheKeyFor(kind: string, baseURL: string, apiKey: string): string {
  return `${kind}\x00${baseURL}\x00${apiKey}`;
}

/**
 * Resolve which provider + model id should serve a request for the given
 * provider id (the value the user picked in the sidebar).
 *
 * Returns `null` when the provider is unknown / not ready / missing base URL
 * or API key, so the caller can fall back to the OAuth-authenticated default
 * Anthropic gateway (legacy behaviour) instead of refusing to send anything.
 */
export async function resolveClientForProvider(
  providerId: string | undefined,
  forceRefresh = false
): Promise<ResolvedClientConfig | null> {
  const config = await loadProviderConfig(forceRefresh);
  const provider = findProvider(config, providerId);
  if (!provider) return null;
  if (!isProviderReadyForSetup(provider)) return null;
  const baseURL = normalizeProviderBaseURL(
    provider.kind,
    provider.baseURL || DEFAULT_BASE_URL[provider.kind]
  );
  if (!baseURL || !provider.apiKey) return null;
  return {
    baseURL,
    apiKey: provider.apiKey,
    modelId: provider.modelId,
    provider
  };
}

/**
 * Resolve a `(client, modelId)` pair for one outgoing request.
 *
 * Sidepanel and MCP runtime use this right before calling
 * `messages.create / stream`. If the user has configured the selected
 * provider we return a kind-specific runtime; otherwise we fall back to the
 * OAuth-authenticated client the caller passed in so behaviour matches the
 * pre-multi-provider era.
 *
 * `fallbackModelId` is the model id placed on the wire when no provider
 * resolves (default {@link OAUTH_FALLBACK_MODEL}). It must never be empty —
 * sending `model: ""` breaks the OAuth / default-gateway request path that
 * callers fall back to.
 */
export async function dispatchMessagesClient(
  providerId: string | undefined,
  fallback: AnthropicSdkClient,
  fallbackModelId: string = OAUTH_FALLBACK_MODEL
): Promise<{
  client: AnthropicSdkClient;
  runtime: ProviderRuntime;
  modelId: string;
  provider?: AiProvider;
}> {
  const resolved = await resolveClientForProvider(providerId);
  if (!resolved) {
    return {
      client: fallback,
      runtime: createAnthropicRuntime(fallback),
      modelId: fallbackModelId || OAUTH_FALLBACK_MODEL
    };
  }

  const key = cacheKeyFor(resolved.provider.kind, resolved.baseURL, resolved.apiKey);
  if (!cachedDispatchClient || cachedDispatchClient.cacheKey !== key) {
    cachedDispatchClient = {
      cacheKey: key,
      runtime: createProviderRuntime(resolved.provider, resolved.baseURL)
    };
  }
  return {
    client: fallback,
    runtime: cachedDispatchClient.runtime,
    modelId: resolved.modelId,
    provider: resolved.provider
  };
}

export function clearDispatchClientCache(): void {
  cachedDispatchClient = null;
}
