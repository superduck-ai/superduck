import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  clearProviderCache,
  isValidProviderBaseURL,
  loadProviderConfig,
  normalizeProviderBaseURL,
  PROVIDER_CONFIG_VERSION,
  PROVIDER_STORAGE_KEYS,
  type AiProvider
} from './providerStore';

function configuredProvider(overrides: Partial<AiProvider> = {}): AiProvider {
  return {
    id: 'provider-1',
    kind: 'openai-compatible',
    name: 'Gateway',
    modelId: 'gpt-4o',
    apiKey: 'sk-test',
    baseURL: 'https://example.com/v1',
    status: 'active',
    ...overrides
  };
}

describe('loadProviderConfig migration', () => {
  afterEach(() => {
    clearProviderCache();
    vi.unstubAllGlobals();
  });

  it('translates a legacy selected Claude model into the mapped provider id', async () => {
    const deepProvider = configuredProvider({
      id: 'provider-deep',
      modelId: 'claude-opus-provider'
    });
    const smartProvider = configuredProvider({
      id: 'provider-smart',
      modelId: 'gpt-4o'
    });
    const storageValues: Record<string, unknown> = {
      [PROVIDER_STORAGE_KEYS.CONFIG_VERSION]: 1,
      [PROVIDER_STORAGE_KEYS.PROVIDERS]: [deepProvider, smartProvider],
      [PROVIDER_STORAGE_KEYS.MAPPING]: {
        deep: { providerId: deepProvider.id, modelId: deepProvider.modelId },
        smart: { providerId: smartProvider.id, modelId: smartProvider.modelId },
        flash: null
      },
      selectedModel: 'claude-sonnet-4-6'
    };
    const setMock = vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(storageValues, values);
    });
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => storageValues),
          set: setMock
        }
      }
    });

    await expect(loadProviderConfig(true)).resolves.toEqual({
      providers: [deepProvider, smartProvider]
    });
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        [PROVIDER_STORAGE_KEYS.CONFIG_VERSION]: PROVIDER_CONFIG_VERSION,
        [PROVIDER_STORAGE_KEYS.MAPPING]: null,
        selectedModel: smartProvider.id
      })
    );
    expect(storageValues.selectedModel).toBe(smartProvider.id);
  });
});

describe('normalizeProviderBaseURL', () => {
  it('auto prefixes bare domains with https', () => {
    expect(normalizeProviderBaseURL('openai-compatible', 'api.example.com')).toBe(
      'https://api.example.com'
    );
  });

  it('keeps full https url and trims endpoint suffix', () => {
    expect(
      normalizeProviderBaseURL('openai-compatible', 'https://api.example.com/v1/responses')
    ).toBe('https://api.example.com/v1');
  });

  it('accepts explicit http urls with single-label hostnames', () => {
    expect(normalizeProviderBaseURL('openai-compatible', 'http://ollama:11434/v1')).toBe(
      'http://ollama:11434/v1'
    );
  });

  it('returns empty string for invalid input', () => {
    expect(normalizeProviderBaseURL('openai-compatible', 'not a url')).toBe('');
    expect(normalizeProviderBaseURL('openai-compatible', 'https://')).toBe('');
  });
});

describe('isValidProviderBaseURL', () => {
  it('accepts blank, bare domains, and full https urls', () => {
    expect(isValidProviderBaseURL('')).toBe(true);
    expect(isValidProviderBaseURL('api.example.com')).toBe(true);
    expect(isValidProviderBaseURL('https://api.example.com/v1')).toBe(true);
    expect(isValidProviderBaseURL('http://ollama:11434/v1')).toBe(true);
    expect(isValidProviderBaseURL('http://my-gateway:8080')).toBe(true);
  });

  it('rejects bare single-label hostnames without an explicit scheme', () => {
    expect(isValidProviderBaseURL('ollama')).toBe(false);
    expect(isValidProviderBaseURL('my-gateway:8080')).toBe(false);
  });

  it('rejects invalid and unsupported protocol urls', () => {
    expect(isValidProviderBaseURL('https://')).toBe(false);
    expect(isValidProviderBaseURL('not a url')).toBe(false);
    expect(isValidProviderBaseURL('javascript:alert(1)')).toBe(false);
    expect(isValidProviderBaseURL('https://user:pass@api.example.com')).toBe(false);
  });
});
