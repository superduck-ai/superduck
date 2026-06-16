import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  extractModelContextLengths,
  fetchProviderModelCatalog,
  fetchProviderModels,
  isValidProviderBaseURL,
  lookupModelContextLength,
  normalizeProviderBaseURL,
  OPENAI_RESPONSES_MIN_OUTPUT_TOKENS,
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

describe('extractModelContextLengths', () => {
  it('indexes models by id and normalized id from a bare array', () => {
    expect(
      extractModelContextLengths([
        { id: 'claude-opus-4.6', context_length: 900_000 },
        { id: 'claude-haiku-4-5-20251001', context_length: 200_000 }
      ])
    ).toEqual({
      'claude-opus-4.6': 900_000,
      'claude-opus-4-6': 900_000,
      'claude-haiku-4-5-20251001': 200_000
    });
  });

  it('unwraps { data: [...] } payloads', () => {
    expect(
      extractModelContextLengths({ data: [{ id: 'gpt-4o', context_length: 128_000 }] })
    ).toEqual({ 'gpt-4o': 128_000 });
  });

  it('uses max_input_tokens from Anthropic-compatible gateways', () => {
    expect(
      extractModelContextLengths({
        data: [
          { id: 'CVTE-AUTO', max_input_tokens: 1_000_000 },
          { id: 'glm-5.1', max_input_tokens: 200_000 }
        ]
      })
    ).toEqual({
      'CVTE-AUTO': 1_000_000,
      'glm-5.1': 200_000
    });
  });

  it('uses name as the model id when id is not present', () => {
    expect(
      extractModelContextLengths({
        data: [{ name: 'models/gemini-2.5-pro', max_input_tokens: 1_048_576 }]
      })
    ).toEqual({
      'gemini-2.5-pro': 1_048_576
    });
  });

  it('skips entries without a usable context_length', () => {
    expect(
      extractModelContextLengths([
        { id: 'no-ctx' },
        { id: 'zero', context_length: 0 },
        { id: 'neg', context_length: -1 },
        { context_length: 1000 },
        { id: 'ok', context_length: 64_000 }
      ])
    ).toEqual({ ok: 64_000 });
  });

  it('returns an empty map for non-list payloads', () => {
    expect(extractModelContextLengths(null)).toEqual({});
    expect(extractModelContextLengths({})).toEqual({});
  });
});

describe('lookupModelContextLength', () => {
  it('matches exact and normalized model ids', () => {
    const lengths = {
      'claude-opus-4.6': 900_000,
      'claude-opus-4-6': 900_000
    };

    expect(lookupModelContextLength(lengths, 'claude-opus-4.6')).toBe(900_000);
    expect(lookupModelContextLength(lengths, 'claude-opus-4-6')).toBe(900_000);
  });

  it('returns undefined when the catalog has no usable value for the model', () => {
    expect(lookupModelContextLength({ other: 128_000 }, 'missing')).toBeUndefined();
    expect(lookupModelContextLength({ missing: 0 }, 'missing')).toBeUndefined();
  });
});

describe('fetchProviderModelCatalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns both model ids and the context-length index from one request', async () => {
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
    expect(catalog.contextLengths).toEqual({
      'gpt-4o': 128_000,
      'claude-opus-4.6': 1_000_000,
      'claude-opus-4-6': 1_000_000
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
