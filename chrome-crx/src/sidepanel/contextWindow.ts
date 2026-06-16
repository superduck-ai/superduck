import { getModelContextLength } from '../constants/models';

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
 * 1. `providerContextLength` — saved at config time from /v1/models.
 * 2. Built-in per-model defaults for canonical Anthropic ids.
 * 3. Global fallback (256k), via {@link getModelContextLength}.
 */
export function resolveEffectiveContextWindow(options: ResolveContextWindowOptions): number {
  const { modelId, providerContextLength } = options;
  if (typeof providerContextLength === 'number' && providerContextLength > 0) {
    return providerContextLength;
  }
  return getModelContextLength(modelId);
}
