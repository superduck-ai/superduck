import { describe, expect, it, vi, afterEach } from 'vitest';
import { fetchProviderModels, type AiProvider } from './providerStore';

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
