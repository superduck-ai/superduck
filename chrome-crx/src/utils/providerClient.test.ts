import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDispatchClientCache,
  dispatchMessagesClient,
  resolveClientForProvider
} from './providerClient';
import { OAUTH_FALLBACK_MODEL } from '../constants/models';
import {
  clearProviderCache,
  PROVIDER_CONFIG_VERSION,
  PROVIDER_STORAGE_KEYS,
  type AiProvider
} from './providerStore';

function provider(overrides: Partial<AiProvider> = {}): AiProvider {
  return {
    id: 'provider-1',
    kind: 'openai-compatible',
    name: 'Gateway',
    modelId: 'gpt-4o',
    apiKey: 'sk-test',
    baseURL: 'https://example.com/v1',
    status: 'unknown',
    ...overrides
  };
}

describe('resolveClientForProvider', () => {
  let storageValues: Record<string, unknown>;

  beforeEach(() => {
    clearProviderCache();
    storageValues = {
      [PROVIDER_STORAGE_KEYS.CONFIG_VERSION]: PROVIDER_CONFIG_VERSION,
      [PROVIDER_STORAGE_KEYS.PROVIDERS]: []
    };
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => storageValues),
          set: vi.fn(async () => undefined)
        }
      }
    });
  });

  afterEach(() => {
    clearProviderCache();
    clearDispatchClientCache();
    vi.unstubAllGlobals();
  });

  function fakeFallbackClient(): unknown {
    const noop = vi.fn();
    return { beta: { messages: { create: noop, stream: noop } } };
  }

  describe('dispatchMessagesClient fallback model id', () => {
    it('returns the OAuth fallback model (never empty) when no provider resolves', async () => {
      const dispatched = await dispatchMessagesClient(
        'does-not-exist',
        fakeFallbackClient() as never
      );
      expect(dispatched.modelId).toBe(OAUTH_FALLBACK_MODEL);
      expect(dispatched.modelId).not.toBe('');
      expect(dispatched.provider).toBeUndefined();
    });

    it('honours an explicit fallbackModelId when no provider resolves', async () => {
      const dispatched = await dispatchMessagesClient(
        undefined,
        fakeFallbackClient() as never,
        'claude-opus-4-6'
      );
      expect(dispatched.modelId).toBe('claude-opus-4-6');
    });
  });

  function storeProvider(configuredProvider: AiProvider): void {
    storageValues = {
      ...storageValues,
      [PROVIDER_STORAGE_KEYS.PROVIDERS]: [configuredProvider]
    };
  }

  it('resolves a complete non-error provider by id', async () => {
    const configuredProvider = provider({ status: 'active' });
    storeProvider(configuredProvider);

    await expect(resolveClientForProvider(configuredProvider.id, true)).resolves.toMatchObject({
      baseURL: 'https://example.com/v1',
      apiKey: 'sk-test',
      modelId: 'gpt-4o',
      provider: configuredProvider
    });
  });

  it('rejects a provider in error status', async () => {
    const configuredProvider = provider({ status: 'error' });
    storeProvider(configuredProvider);

    await expect(resolveClientForProvider(configuredProvider.id, true)).resolves.toBeNull();
  });

  it('returns null for an unknown provider id', async () => {
    storeProvider(provider({ status: 'active' }));

    await expect(resolveClientForProvider('does-not-exist', true)).resolves.toBeNull();
  });
});
