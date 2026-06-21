import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEXT_LENGTH } from '../constants/models';
import { resolveEffectiveContextWindow } from './contextWindow';

describe('resolveEffectiveContextWindow', () => {
  it('uses the saved provider context length when present', () => {
    expect(
      resolveEffectiveContextWindow({
        modelId: 'claude-haiku-4-5-20251001',
        providerContextLength: 512_000
      })
    ).toBe(512_000);
  });

  it('provider context length overrides the built-in default', () => {
    expect(
      resolveEffectiveContextWindow({
        modelId: 'claude-opus-4-6',
        providerContextLength: 200_000
      })
    ).toBe(200_000);
  });

  it('uses bundled metadata when a saved provider value is only the default fallback', () => {
    expect(
      resolveEffectiveContextWindow({
        modelId: 'kimi-k2.5',
        providerContextLength: DEFAULT_CONTEXT_LENGTH
      })
    ).toBe(262_144);
  });

  it('ignores non-positive provider context length and falls back to built-in', () => {
    expect(
      resolveEffectiveContextWindow({
        modelId: 'claude-opus-4-6',
        providerContextLength: 0
      })
    ).toBe(1_000_000);
  });

  it('uses built-in per-model defaults for known models when nothing is saved', () => {
    expect(resolveEffectiveContextWindow({ modelId: 'claude-opus-4-6' })).toBe(1_000_000);
    expect(resolveEffectiveContextWindow({ modelId: 'claude-haiku-4-5-20251001' })).toBe(200_000);
  });

  it('falls back to the 256k default for unknown models with no saved value', () => {
    expect(resolveEffectiveContextWindow({ modelId: 'unknown-model' })).toBe(
      DEFAULT_CONTEXT_LENGTH
    );
  });
});
