import {
  DEFAULT_CONTEXT_LENGTH,
  getPreferredConfiguredModelContextLength
} from '../constants/models';

export interface ResolveContextWindowOptions {
  modelId: string;
  /**
   * Context window captured from the gateway's /v1/models at config/save time
   * and stored on the bound provider. Treated as authoritative — it reflects
   * the model the user actually bound to the tier, not a hardcoded guess.
   */
  providerContextLength?: number;
}

/**
 * Resolve the context window for the active model.
 *
 * Priority:
 * 1. Non-default `providerContextLength` saved at config time.
 * 2. Bundled per-model metadata for known model ids.
 * 3. Saved default-sized provider context length.
 * 4. Global fallback (256k).
 */
export function resolveEffectiveContextWindow(options: ResolveContextWindowOptions): number {
  const { modelId, providerContextLength } = options;
  return (
    getPreferredConfiguredModelContextLength(modelId, providerContextLength) ??
    DEFAULT_CONTEXT_LENGTH
  );
}
