import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  fetchProviderModels,
  isValidProviderBaseURL,
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
