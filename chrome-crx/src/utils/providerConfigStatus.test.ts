import { describe, expect, it } from 'vitest';
import {
  getFirstUsableProvider,
  isProviderConfigUsable,
  parseProviderConfigSnapshot
} from './providerConfigStatus';
import type { AiProvider, ProviderConfig } from './providerStore';

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

function config(providers: AiProvider[] = []): ProviderConfig {
  return { providers };
}

describe('provider config setup status', () => {
  it('treats an empty config as unusable', () => {
    expect(isProviderConfigUsable(config())).toBe(false);
  });

  it('treats a config with one complete non-error provider as usable', () => {
    const configuredProvider = provider({ status: 'active' });
    expect(isProviderConfigUsable(config([configuredProvider]))).toBe(true);
  });

  it('keeps setup incomplete when the only provider is in error status', () => {
    const configuredProvider = provider({ status: 'error' });
    expect(isProviderConfigUsable(config([configuredProvider]))).toBe(false);
  });

  it('is usable when at least one provider is ready even if others are not', () => {
    const ready = provider({ id: 'ready', status: 'active' });
    const broken = provider({ id: 'broken', status: 'error', apiKey: '' });
    expect(isProviderConfigUsable(config([broken, ready]))).toBe(true);
  });

  it('keeps setup incomplete when the provider lacks required fields', () => {
    const configuredProvider = provider({ apiKey: '' });
    expect(isProviderConfigUsable(config([configuredProvider]))).toBe(false);
  });

  it('returns the first ready provider from getFirstUsableProvider', () => {
    const broken = provider({ id: 'broken', status: 'error' });
    const ready = provider({ id: 'ready', status: 'active' });
    expect(getFirstUsableProvider(config([broken, ready]))?.id).toBe('ready');
  });

  it('returns undefined when no provider is ready', () => {
    expect(getFirstUsableProvider(config())).toBeUndefined();
  });

  it('parses valid saved snapshots and rejects malformed snapshots', () => {
    const configuredProvider = provider();
    const snapshot = config([configuredProvider]);

    expect(parseProviderConfigSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(parseProviderConfigSnapshot('not json')).toBeNull();
    expect(parseProviderConfigSnapshot(JSON.stringify({ mapping: {} }))).toBeNull();
  });
});
