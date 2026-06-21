import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  clearProviderCache,
  extractModelMetadata,
  fetchProviderModelCatalog,
  fetchProviderModels,
  getModelMetadataCacheStorageKey,
  isValidProviderBaseURL,
  loadProviderConfig,
  lookupCachedModelMetadata,
  lookupModelMetadata,
  normalizeProviderBaseURL,
  OPENAI_RESPONSES_MIN_OUTPUT_TOKENS,
  PROVIDER_CONFIG_VERSION,
  PROVIDER_STORAGE_KEYS,
  testProviderConnection,
  type AiProvider
} from './providerStore';

const OPENAI_MOCKS = vi.hoisted(() => ({
  chatCompletionsCreate: vi.fn(),
  responsesCreate: vi.fn()
}));

vi.mock('openai', () => {
  class APIError extends Error {
    status?: number;
  }
  const OpenAI = vi.fn().mockImplementation(function () {
    return {
      chat: { completions: { create: OPENAI_MOCKS.chatCompletionsCreate } },
      responses: { create: OPENAI_MOCKS.responsesCreate }
    };
  });
  Object.assign(OpenAI, { APIError });
  return { default: OpenAI };
});

const baseProvider: AiProvider = {
  id: 'provider-1',
  kind: 'openai-compatible',
  name: 'Gateway',
  modelId: '',
  apiKey: 'sk-test',
  baseURL: 'https://example.com/v1',
  status: 'unknown'
};

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

describe('fetchProviderModels', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads OpenAI-compatible model ids from the provider models endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: 'gpt-4o-mini' }, { id: 'claude-3-5-sonnet' }, { id: 42 }, {}]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProviderModels(baseProvider)).resolves.toEqual([
      'claude-3-5-sonnet',
      'gpt-4o-mini'
    ]);
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer sk-test',
        'Content-Type': 'application/json'
      },
      signal: expect.any(AbortSignal)
    });
  });

  it('throws a useful error when the models endpoint is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 })
        )
    );

    await expect(fetchProviderModels(baseProvider)).rejects.toThrow('HTTP 401 - bad key');
  });

  it('falls back to root /v1/models for Anthropic gateways mounted under /anthropic', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: 'mimo-v2.5', object: 'model', owned_by: 'xiaomi' }]
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchProviderModels({
        ...baseProvider,
        kind: 'anthropic',
        baseURL: 'https://api.xiaomimimo.com/anthropic'
      })
    ).resolves.toEqual(['mimo-v2.5']);
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api.xiaomimimo.com/anthropic/v1/models', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': 'sk-test'
      },
      signal: expect.any(AbortSignal)
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://api.xiaomimimo.com/v1/models', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': 'sk-test'
      },
      signal: expect.any(AbortSignal)
    });
  });
});

describe('extractModelMetadata', () => {
  it('indexes models by id and normalized id from a bare array', () => {
    const metadata = extractModelMetadata([
      { id: 'claude-opus-4.6', context_length: 900_000 },
      { id: 'claude-haiku-4-5-20251001', context_length: 200_000 }
    ]);

    expect(metadata['claude-opus-4.6']).toMatchObject({
      id: 'claude-opus-4.6',
      contextLength: 900_000
    });
    expect(metadata['claude-opus-4-6']).toBe(metadata['claude-opus-4.6']);
    expect(metadata['claude-haiku-4-5-20251001']).toMatchObject({
      id: 'claude-haiku-4-5-20251001',
      contextLength: 200_000
    });
  });

  it('unwraps { data: [...] } payloads', () => {
    const metadata = extractModelMetadata({
      data: [{ id: 'gpt-4o', context_length: 128_000 }]
    });

    expect(metadata['gpt-4o']).toMatchObject({
      id: 'gpt-4o',
      contextLength: 128_000
    });
  });

  it('uses max_input_tokens from Anthropic-compatible gateways', () => {
    const metadata = extractModelMetadata({
      data: [
        { id: 'CVTE-AUTO', max_input_tokens: 1_000_000 },
        { id: 'glm-5.1', max_input_tokens: 200_000 }
      ]
    });

    expect(metadata['CVTE-AUTO']).toMatchObject({
      id: 'CVTE-AUTO',
      contextLength: 1_000_000
    });
    expect(metadata['glm-5.1']).toMatchObject({
      id: 'glm-5.1',
      contextLength: 200_000
    });
  });

  it('uses name as the model id when id is not present', () => {
    const metadata = extractModelMetadata({
      data: [{ name: 'models/gemini-2.5-pro', max_input_tokens: 1_048_576 }]
    });

    expect(metadata['gemini-2.5-pro']).toMatchObject({
      id: 'gemini-2.5-pro',
      contextLength: 1_048_576
    });
  });

  it('uses OpenRouter top_provider context length when present', () => {
    const metadata = extractModelMetadata({
      data: [
        {
          id: 'openai/gpt-4o',
          top_provider: { context_length: 128_000 }
        }
      ]
    });

    expect(metadata['openai/gpt-4o']).toMatchObject({
      id: 'openai/gpt-4o',
      contextLength: 128_000
    });
    expect(metadata['gpt-4o']).toBe(metadata['openai/gpt-4o']);
  });

  it('indexes OpenRouter provider-prefixed ids, short ids, and canonical slugs', () => {
    const metadata = extractModelMetadata({
      data: [
        {
          id: 'moonshotai/kimi-k2.5',
          canonical_slug: 'moonshotai/kimi-k2.5-0127',
          context_length: 262_144,
          top_provider: { context_length: 256_000 }
        }
      ]
    });

    expect(metadata['moonshotai/kimi-k2.5']).toMatchObject({
      id: 'moonshotai/kimi-k2.5',
      canonicalSlug: 'moonshotai/kimi-k2.5-0127',
      contextLength: 262_144
    });
    expect(metadata['kimi-k2.5']).toBe(metadata['moonshotai/kimi-k2.5']);
    expect(metadata['moonshotai/kimi-k2.5-0127']).toBe(metadata['moonshotai/kimi-k2.5']);
    expect(metadata['kimi-k2.5-0127']).toBe(metadata['moonshotai/kimi-k2.5']);
  });

  it('keeps models without context length while skipping invalid model ids', () => {
    const metadata = extractModelMetadata([
      { id: 'no-ctx' },
      { id: 'zero', context_length: 0 },
      { id: 'neg', context_length: -1 },
      { context_length: 1000 },
      { id: 'ok', context_length: 64_000 }
    ]);

    expect(metadata['no-ctx']).toMatchObject({ id: 'no-ctx' });
    expect(metadata.zero).toMatchObject({ id: 'zero' });
    expect(metadata.neg).toMatchObject({ id: 'neg' });
    expect(metadata.ok).toMatchObject({ id: 'ok', contextLength: 64_000 });
    expect(Object.values(metadata).some((model) => model.id === '')).toBe(false);
  });

  it('returns an empty map for non-list payloads', () => {
    expect(extractModelMetadata(null)).toEqual({});
    expect(extractModelMetadata({})).toEqual({});
  });

  it('indexes reusable metadata fields from OpenRouter-style payloads', () => {
    const metadata = extractModelMetadata({
      data: [
        {
          id: 'aion-labs/aion-2.0',
          canonical_slug: 'aion-labs/aion-2.0-20260223',
          name: 'AionLabs: Aion-2.0',
          context_length: 131_072,
          architecture: {
            modality: 'text->text',
            input_modalities: ['text'],
            output_modalities: ['text'],
            tokenizer: 'Other'
          },
          pricing: { prompt: '0.0000002', completion: '0.0000008' },
          supported_parameters: ['temperature', 'top_p'],
          top_provider: {
            max_completion_tokens: 32_768,
            is_moderated: false
          }
        }
      ]
    });

    expect(metadata['aion-2.0']).toMatchObject({
      id: 'aion-labs/aion-2.0',
      canonicalSlug: 'aion-labs/aion-2.0-20260223',
      name: 'AionLabs: Aion-2.0',
      contextLength: 131_072,
      maxCompletionTokens: 32_768,
      isModerated: false,
      modality: 'text->text',
      inputModalities: ['text'],
      outputModalities: ['text'],
      tokenizer: 'Other',
      pricing: { prompt: '0.0000002', completion: '0.0000008' },
      supportedParameters: ['temperature', 'top_p']
    });
    expect(metadata['aion-labs/aion-2.0-20260223']).toBe(metadata['aion-2.0']);
  });
});

describe('lookupCachedModelMetadata', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the local metadata cache without fetching remote metadata', async () => {
    const cacheKey = getModelMetadataCacheStorageKey(baseProvider);
    const get = vi.fn().mockResolvedValue({
      [cacheKey]: {
        fetchedAt: Date.now(),
        models: {
          'aion-labs/aion-2.0': {
            id: 'aion-labs/aion-2.0',
            canonicalSlug: 'aion-labs/aion-2.0-20260223',
            name: 'AionLabs: Aion-2.0',
            contextLength: 131_072,
            inputModalities: ['text', 'image']
          }
        }
      }
    });
    const set = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('chrome', { storage: { local: { get, set } } });
    vi.stubGlobal('fetch', fetchMock);

    await expect(lookupCachedModelMetadata(baseProvider, 'aion-2.0')).resolves.toMatchObject({
      id: 'aion-labs/aion-2.0',
      contextLength: 131_072,
      inputModalities: ['text', 'image']
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('matches short ids against provider-prefixed local metadata entries', async () => {
    const cacheKey = getModelMetadataCacheStorageKey(baseProvider);
    const get = vi.fn().mockResolvedValue({
      [cacheKey]: {
        fetchedAt: Date.now(),
        models: {
          'moonshotai/kimi-k2.5': {
            id: 'moonshotai/kimi-k2.5',
            contextLength: 262_144
          }
        }
      }
    });
    vi.stubGlobal('chrome', { storage: { local: { get } } });

    await expect(lookupCachedModelMetadata(baseProvider, 'kimi-k2.5')).resolves.toMatchObject({
      id: 'moonshotai/kimi-k2.5',
      contextLength: 262_144
    });
  });

  it('does not reuse cached metadata from another provider scope', async () => {
    const otherProvider = {
      ...baseProvider,
      baseURL: 'https://other.example.com/v1'
    };
    const get = vi.fn().mockResolvedValue({
      [getModelMetadataCacheStorageKey(otherProvider)]: {
        fetchedAt: Date.now(),
        models: {
          'gpt-4o': {
            id: 'gpt-4o',
            contextLength: 1_000
          }
        }
      }
    });
    vi.stubGlobal('chrome', { storage: { local: { get } } });

    await expect(lookupCachedModelMetadata(baseProvider, 'gpt-4o')).resolves.toBeUndefined();
  });

  it('returns undefined on cache miss without fetching remote metadata', async () => {
    const get = vi.fn().mockResolvedValue({});
    const set = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('chrome', { storage: { local: { get, set } } });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      lookupCachedModelMetadata(baseProvider, 'anthropic/claude-sonnet-4.5')
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
});

describe('lookupModelMetadata', () => {
  it('matches exact and normalized model ids', () => {
    const metadata = {
      'claude-opus-4.6': {
        id: 'claude-opus-4.6',
        contextLength: 900_000
      },
      'claude-opus-4-6': {
        id: 'claude-opus-4.6',
        contextLength: 900_000
      }
    };

    expect(lookupModelMetadata(metadata, 'claude-opus-4.6')).toMatchObject({
      id: 'claude-opus-4.6',
      contextLength: 900_000
    });
    expect(lookupModelMetadata(metadata, 'claude-opus-4-6')).toMatchObject({
      id: 'claude-opus-4.6',
      contextLength: 900_000
    });
  });

  it('matches short ids against provider-prefixed metadata entries', () => {
    const metadata = {
      'aion-labs/aion-2.0': {
        id: 'aion-labs/aion-2.0',
        contextLength: 131_072
      }
    };

    expect(lookupModelMetadata(metadata, 'aion-2.0')).toMatchObject({
      id: 'aion-labs/aion-2.0',
      contextLength: 131_072
    });
  });

  it('matches provider-prefixed catalog entries from short model ids', () => {
    const metadata = {
      'moonshotai/kimi-k2.5': {
        id: 'moonshotai/kimi-k2.5',
        contextLength: 262_144
      }
    };

    expect(lookupModelMetadata(metadata, 'kimi-k2.5')).toMatchObject({
      id: 'moonshotai/kimi-k2.5',
      contextLength: 262_144
    });
  });

  it('returns undefined when the catalog has no usable value for the model', () => {
    expect(
      lookupModelMetadata({ other: { id: 'other', contextLength: 128_000 } }, 'missing')
    ).toBeUndefined();
    expect(lookupModelMetadata({}, 'missing')).toBeUndefined();
  });
});

describe('fetchProviderModelCatalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns model ids and metadata, then caches metadata from one request', async () => {
    const set = vi.fn();
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set
        }
      }
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              { id: 'gpt-4o', context_length: 128_000 },
              { id: 'claude-opus-4.6', context_length: 1_000_000 }
            ]
          }),
          { status: 200 }
        )
      )
    );

    const catalog = await fetchProviderModelCatalog(baseProvider);
    expect(catalog.models).toEqual(['claude-opus-4.6', 'gpt-4o']);
    expect(catalog.metadata['gpt-4o']).toMatchObject({
      id: 'gpt-4o',
      contextLength: 128_000
    });
    expect(catalog.metadata['claude-opus-4-6']).toBe(catalog.metadata['claude-opus-4.6']);
    const cacheKey = getModelMetadataCacheStorageKey(baseProvider);
    expect(set).toHaveBeenCalledWith({
      [cacheKey]: expect.objectContaining({
        fetchedAt: expect.any(Number),
        models: expect.objectContaining({
          'gpt-4o': expect.objectContaining({
            id: 'gpt-4o',
            contextLength: 128_000
          })
        })
      })
    });
  });
});

describe('testProviderConnection', () => {
  afterEach(() => {
    OPENAI_MOCKS.chatCompletionsCreate.mockReset();
    OPENAI_MOCKS.responsesCreate.mockReset();
  });

  it('uses the minimum Responses output token budget accepted by GPT gateways', async () => {
    OPENAI_MOCKS.responsesCreate.mockResolvedValue({});

    await expect(
      testProviderConnection({
        ...baseProvider,
        modelId: 'gpt-5.4'
      })
    ).resolves.toEqual({ ok: true });

    expect(OPENAI_MOCKS.responsesCreate).toHaveBeenCalledWith(
      {
        model: 'gpt-5.4',
        input: 'ping',
        max_output_tokens: OPENAI_RESPONSES_MIN_OUTPUT_TOKENS
      },
      { signal: expect.any(AbortSignal) }
    );
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
