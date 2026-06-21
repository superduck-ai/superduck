import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTEXT_LENGTH,
  getConfiguredModelMetadata,
  getOpenRouterModelMetadata,
  getModelContextLength,
  getPreferredConfiguredModelContextLength,
  normalizeModelId
} from '../constants/models';

describe('models context lengths', () => {
  it('returns per-model defaults for built-in models', () => {
    expect(getModelContextLength('claude-opus-4-6')).toBe(1_000_000);
    expect(getModelContextLength('claude-sonnet-4-6')).toBe(1_000_000);
    expect(getModelContextLength('claude-haiku-4-5-20251001')).toBe(200_000);
  });

  it('normalizes aliases before resolving context length', () => {
    expect(getModelContextLength('claude-opus-4.6')).toBe(1_000_000);
    expect(normalizeModelId('claude-opus-4.6')).toBe('claude-opus-4-6');
  });

  it('resolves OpenRouter-style provider-prefixed model ids from bundled metadata', () => {
    expect(getModelContextLength('anthropic/claude-opus-4.6')).toBe(1_000_000);
  });

  it('resolves Kimi OpenRouter ids from bundled metadata', () => {
    expect(getModelContextLength('kimi-k2.5')).toBe(262_144);
    expect(getModelContextLength('moonshotai/kimi-k2.5')).toBe(262_144);
    expect(getModelContextLength('moonshotai/kimi-k2.5-0127')).toBe(262_144);
    expect(getConfiguredModelMetadata('kimi-k2.5')).toMatchObject({
      inputModalities: ['text', 'image']
    });
  });

  it('uses bundled metadata instead of a default-sized stale detected value', () => {
    expect(getPreferredConfiguredModelContextLength('kimi-k2.5', DEFAULT_CONTEXT_LENGTH)).toBe(
      262_144
    );
    expect(getPreferredConfiguredModelContextLength('aion-2.0', DEFAULT_CONTEXT_LENGTH)).toBe(
      131_072
    );
  });

  it('keeps non-default detected context lengths for provider-specific models', () => {
    expect(getPreferredConfiguredModelContextLength('claude-opus-4-6', 200_000)).toBe(200_000);
    expect(getPreferredConfiguredModelContextLength('unknown-model', DEFAULT_CONTEXT_LENGTH)).toBe(
      DEFAULT_CONTEXT_LENGTH
    );
  });

  it('resolves bundled OpenRouter context lengths for short and canonical ids', () => {
    expect(getModelContextLength('aion-2.0')).toBe(131_072);
    expect(getModelContextLength('aion-labs/aion-2.0')).toBe(131_072);
    expect(getModelContextLength('aion-labs/aion-2.0-20260223')).toBe(131_072);
  });

  it('returns bundled OpenRouter model metadata beyond context length', () => {
    expect(getOpenRouterModelMetadata('aion-2.0')).toMatchObject({
      id: 'aion-labs/aion-2.0',
      canonicalSlug: 'aion-labs/aion-2.0-20260223',
      name: 'AionLabs: Aion-2.0',
      contextLength: 131_072,
      maxCompletionTokens: 32_768,
      outputModalities: ['text']
    });
    expect(getConfiguredModelMetadata('aion-2.0')).toMatchObject({
      source: 'openrouter',
      contextLength: 131_072
    });
  });

  it('preserves per-version budgets for legacy Claude ids', () => {
    expect(normalizeModelId('claude-3-5-sonnet-20241022')).toBe('claude-sonnet-4-6');
    expect(getModelContextLength('claude-3-5-sonnet-20241022')).toBe(200_000);
    expect(getModelContextLength('claude-opus-4-20250514')).toBe(200_000);
  });

  it('falls back to the default context length for unknown models', () => {
    expect(getModelContextLength('custom-model')).toBe(DEFAULT_CONTEXT_LENGTH);
  });
});
