import { describe, expect, it } from 'vitest';
import {
  getUpdatedMappingForProviderSave,
  isProviderConfigUsable,
  parseProviderConfigSnapshot
} from './providerConfigStatus';
import type { AiProvider, ModelMappingV2, ProviderConfig } from './providerStore';

const EMPTY_MAPPING: ModelMappingV2 = {
  deep: null,
  smart: null,
  flash: null
};

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

function config(
  providers: AiProvider[] = [],
  mapping: ModelMappingV2 = EMPTY_MAPPING
): ProviderConfig {
  return {
    providers,
    mapping
  };
}

describe('provider config setup status', () => {
  it('treats an empty config as unusable', () => {
    expect(isProviderConfigUsable(config())).toBe(false);
  });

  it('treats a complete non-error provider mapped to all tiers as usable', () => {
    const configuredProvider = provider({ status: 'active' });

    expect(
      isProviderConfigUsable(config([configuredProvider], bindAll(configuredProvider.id)))
    ).toBe(true);
  });

  it('keeps setup incomplete when a mapped provider is in error status', () => {
    const configuredProvider = provider({ status: 'error' });

    expect(
      isProviderConfigUsable(config([configuredProvider], bindAll(configuredProvider.id)))
    ).toBe(false);
  });

  it('keeps setup incomplete when any tier is missing', () => {
    const configuredProvider = provider();

    expect(
      isProviderConfigUsable(
        config([configuredProvider], {
          deep: { providerId: configuredProvider.id, modelId: configuredProvider.modelId },
          smart: { providerId: configuredProvider.id, modelId: configuredProvider.modelId },
          flash: null
        })
      )
    ).toBe(false);
  });

  it('keeps setup incomplete when the mapped provider lacks required fields', () => {
    const configuredProvider = provider({ apiKey: '' });

    expect(
      isProviderConfigUsable(config([configuredProvider], bindAll(configuredProvider.id)))
    ).toBe(false);
  });

  it('parses valid saved snapshots and rejects malformed snapshots', () => {
    const configuredProvider = provider();
    const snapshot = config([configuredProvider], bindAll(configuredProvider.id));

    expect(parseProviderConfigSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(parseProviderConfigSnapshot('not json')).toBeNull();
    expect(parseProviderConfigSnapshot(JSON.stringify({ providers: [] }))).toBeNull();
  });

  it('auto-binds the first ready provider to every tier when no usable config exists', () => {
    const nextProvider = provider();

    expect(getUpdatedMappingForProviderSave(config(), nextProvider, -1)).toEqual(
      bindAll(nextProvider.id, nextProvider.modelId)
    );
  });

  it('does not auto-bind a new provider over an existing usable config', () => {
    const existingProvider = provider({ id: 'provider-existing', status: 'active' });
    const nextProvider = provider({ id: 'provider-new', modelId: 'gpt-5' });
    const previous = config([existingProvider], bindAll(existingProvider.id));

    expect(getUpdatedMappingForProviderSave(previous, nextProvider, -1)).toEqual(previous.mapping);
  });

  it('updates tier bindings when an existing provider model changes', () => {
    const previousProvider = provider({ id: 'provider-existing', modelId: 'gpt-4o' });
    const nextProvider = provider({ id: previousProvider.id, modelId: 'gpt-5' });

    expect(
      getUpdatedMappingForProviderSave(
        config([previousProvider], bindAll(previousProvider.id, previousProvider.modelId)),
        nextProvider,
        0
      )
    ).toEqual(bindAll(nextProvider.id, nextProvider.modelId));
  });
});
