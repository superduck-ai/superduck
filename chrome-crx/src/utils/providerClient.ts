import { MessagesClient } from '../mcpServersStore';
import {
  DEFAULT_BASE_URL,
  classifyTier,
  loadProviderConfig,
  normalizeProviderBaseURL,
  resolveTier,
  type AiProvider,
  type Tier
} from './providerStore';
import {
  createAnthropicRuntime,
  createProviderRuntime,
  type ProviderRuntime
} from './providerRuntime';

export interface ResolvedClientConfig {
  baseURL: string;
  apiKey: string;
  modelId: string;
  tier: Tier;
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
 * Resolve which provider + model id should serve a request for the given tier.
 *
 * Returns `null` when neither the requested tier nor any fallback tier is
 * bound, so the caller can fall back to the OAuth-authenticated default
 * Anthropic gateway (legacy behaviour) instead of refusing to send anything.
 */
export async function resolveClientForTier(tier: Tier): Promise<ResolvedClientConfig | null> {
  const config = await loadProviderConfig();
  const resolved = resolveTier(config, tier);
  if (!resolved) return null;
  const baseURL = normalizeProviderBaseURL(
    resolved.provider.kind,
    resolved.provider.baseURL || DEFAULT_BASE_URL[resolved.provider.kind]
  );
  if (!baseURL || !resolved.provider.apiKey) return null;
  return {
    baseURL,
    apiKey: resolved.provider.apiKey,
    modelId: resolved.modelId,
    tier: resolved.tier,
    provider: resolved.provider
  };
}

export async function resolveClientForModel(
  originalModelId: string
): Promise<ResolvedClientConfig | null> {
  return resolveClientForTier(classifyTier(originalModelId));
}

/**
 * Resolve a `(client, modelId)` pair for one outgoing request.
 *
 * Sidepanel and MCP runtime use this right before calling
 * `messages.create / stream`. If the user has configured a provider for this
 * model's tier we return a kind-specific `MessagesClient`; otherwise we fall
 * back to the OAuth-authenticated client the caller passed in so behaviour
 * matches the pre-multi-provider era.
 */
export async function dispatchMessagesClient(
  originalModelId: string,
  fallback: AnthropicSdkClient
): Promise<{
  client: AnthropicSdkClient;
  runtime: ProviderRuntime;
  modelId: string;
  provider?: AiProvider;
}> {
  const resolved = await resolveClientForModel(originalModelId);
  if (!resolved) {
    return {
      client: fallback,
      runtime: createAnthropicRuntime(fallback),
      modelId: originalModelId
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
