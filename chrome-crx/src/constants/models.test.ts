import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTEXT_LENGTH,
  getModelContextLength,
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

  it('preserves per-version budgets for legacy Claude ids', () => {
    expect(normalizeModelId('claude-3-5-sonnet-20241022')).toBe('claude-sonnet-4-6');
    expect(getModelContextLength('claude-3-5-sonnet-20241022')).toBe(200_000);
    expect(getModelContextLength('claude-opus-4-20250514')).toBe(200_000);
  });

  it('falls back to the default context length for unknown models', () => {
    expect(getModelContextLength('custom-model')).toBe(DEFAULT_CONTEXT_LENGTH);
  });
});
