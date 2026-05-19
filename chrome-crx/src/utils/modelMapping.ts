/**
 * Compatibility shim around the new multi-provider store.
 *
 * Historically there was a single (customApiUrl, customApiKey,
 * defaultOpus/Sonnet/HaikuModel) configuration that translated the canonical
 * Claude model id sent to the SDK into whatever the upstream gateway
 * understood. That has been replaced by {@link ./providerStore} which lets
 * the user bind each tier (Deep / Smart / Flash) to a different provider.
 *
 * This file keeps the old surface (`mapModelName`, `getMappedModelName`,
 * `loadModelMapping`, `MODEL_MAPPING_KEYS`) so the many call sites in
 * sidepanel / mcpRuntime continue to work — they all just want "given a
 * canonical model id, what should I actually put on the wire?".
 *
 * Old storage keys are still listed in MODEL_MAPPING_KEYS so that legacy
 * `chrome.storage.onChanged` listeners keep firing during the migration
 * window.
 */

import {
  PROVIDER_STORAGE_KEYS,
  classifyTier,
  loadProviderConfig,
  resolveModelForRequest,
  type ProviderConfig,
  type Tier
} from './providerStore';

export const MODEL_MAPPING_KEYS = {
  HAIKU: 'defaultHaikuModel',
  SONNET: 'defaultSonnetModel',
  OPUS: 'defaultOpusModel',
  PROVIDERS: PROVIDER_STORAGE_KEYS.PROVIDERS,
  MAPPING: PROVIDER_STORAGE_KEYS.MAPPING
} as const;

export interface ModelMappingConfig {
  haiku?: string;
  sonnet?: string;
  opus?: string;
}

function configToMappingConfig(config: ProviderConfig): ModelMappingConfig {
  const pick = (tier: Tier): string => config.mapping[tier]?.modelId ?? '';
  return {
    opus: pick('deep'),
    sonnet: pick('smart'),
    haiku: pick('flash')
  };
}

/**
 * Returns a flat view of the tier → modelId binding, suitable for UI labels
 * that just want to show e.g. "Deep (kimi-k2.5)".
 */
export async function loadModelMapping(): Promise<ModelMappingConfig> {
  const config = await loadProviderConfig();
  return configToMappingConfig(config);
}

/**
 * Translate a canonical Claude model id into whichever model the user has
 * mapped its tier to. If no mapping exists we return the original id so the
 * underlying SDK call still reaches the default Anthropic backend.
 */
export async function mapModelName(originalModel: string): Promise<string> {
  const config = await loadProviderConfig();
  const resolved = resolveModelForRequest(config, originalModel);
  return resolved ? resolved.modelId : originalModel;
}

export function clearModelMappingCache(): void {
  // Cache lives in providerStore now; loadProviderConfig(true) handles it.
}

/**
 * Synchronous label helper used by the sidepanel model picker. Returns the
 * mapped model name (without provider prefix) so the UI can show the user's
 * actual destination next to the canonical Deep / Smart / Flash labels.
 */
export function getMappedModelName(originalModel: string, mapping: ModelMappingConfig): string {
  const tier = classifyTier(originalModel);
  if (tier === 'deep') return mapping.opus ?? '';
  if (tier === 'flash') return mapping.haiku ?? '';
  return mapping.sonnet ?? '';
}

/**
 * Keep external storage listeners aware of either the legacy keys or the new
 * provider/mapping keys, so they refresh whenever Options writes either set.
 */
export function initModelMappingListener(): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    const touched =
      MODEL_MAPPING_KEYS.HAIKU in changes ||
      MODEL_MAPPING_KEYS.SONNET in changes ||
      MODEL_MAPPING_KEYS.OPUS in changes ||
      MODEL_MAPPING_KEYS.PROVIDERS in changes ||
      MODEL_MAPPING_KEYS.MAPPING in changes;
    if (touched) {
      void loadProviderConfig(true);
    }
  });
}
