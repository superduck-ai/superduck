import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveClientForTier } from './providerClient';
import {
  clearProviderCache,
  PROVIDER_CONFIG_VERSION,
  PROVIDER_STORAGE_KEYS,
  type AiProvider,
  type ModelMappingV2
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

function bindAll(providerId: string, modelId = 'gpt-4o'): ModelMappingV2 {
  return {
    deep: { providerId, modelId },
    smart: { providerId, modelId },
    flash: { providerId, modelId }
  };
}

describe('resolveClientForTier', () => {
  let storageValues: Record<string, unknown>;

  beforeEach(() => {
    clearProviderCache();
    storageValues = {
      [PROVIDER_STORAGE_KEYS.CONFIG_VERSION]: PROVIDER_CONFIG_VERSION,
      [PROVIDER_STORAGE_KEYS.PROVIDERS]: [],
      [PROVIDER_STORAGE_KEYS.MAPPING]: {
        deep: null,
        smart: null,
        flash: null
      }
    };
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => storageValues)
        }
      }
    });
  });

  afterEach(() => {
    clearProviderCache();
    vi.unstubAllGlobals();
  });

  function storeProvider(configuredProvider: AiProvider): void {
    storageValues = {
      ...storageValues,
      [PROVIDER_STORAGE_KEYS.PROVIDERS]: [configuredProvider],
      [PROVIDER_STORAGE_KEYS.MAPPING]: bindAll(configuredProvider.id, configuredProvider.modelId)
    };
  }

  it('resolves a complete non-error provider', async () => {
    const configuredProvider = provider({ status: 'active' });
    storeProvider(configuredProvider);

    await expect(resolveClientForTier('smart', true)).resolves.toMatchObject({
      baseURL: 'https://example.com/v1',
      apiKey: 'sk-test',
      modelId: 'gpt-4o',
      tier: 'smart',
      provider: configuredProvider
    });
  });

  it('rejects a mapped provider in error status', async () => {
    const configuredProvider = provider({ status: 'error' });
    storeProvider(configuredProvider);

    await expect(resolveClientForTier('smart', true)).resolves.toBeNull();
  });
});
