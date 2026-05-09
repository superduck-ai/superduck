/**
 * Model mapping utility for custom API endpoints
 * Maps upstream model names to custom model names (e.g., kimi-k2.5)
 */

export const MODEL_MAPPING_KEYS = {
  HAIKU: 'defaultHaikuModel',
  SONNET: 'defaultSonnetModel',
  OPUS: 'defaultOpusModel'
} as const;

export interface ModelMappingConfig {
  haiku?: string;
  sonnet?: string;
  opus?: string;
}

let cachedModelMapping: ModelMappingConfig | null = null;

/**
 * Load model mapping configuration from storage
 */
export async function loadModelMapping(): Promise<ModelMappingConfig> {
  const result = await chrome.storage.local.get([
    MODEL_MAPPING_KEYS.HAIKU,
    MODEL_MAPPING_KEYS.SONNET,
    MODEL_MAPPING_KEYS.OPUS
  ]);

  cachedModelMapping = {
    haiku: (result[MODEL_MAPPING_KEYS.HAIKU] as string) || '',
    sonnet: (result[MODEL_MAPPING_KEYS.SONNET] as string) || '',
    opus: (result[MODEL_MAPPING_KEYS.OPUS] as string) || ''
  };

  return cachedModelMapping;
}

/**
 * Map an upstream model name to custom model name if configured
 * Only applies mapping when custom API URL is configured
 */
export async function mapModelName(originalModel: string): Promise<string> {
  // Check if custom API is configured
  const result = await chrome.storage.local.get('customApiUrl');
  const customApiUrl = result.customApiUrl as string | undefined;

  // If no custom API URL, return original model (don't apply mapping)
  if (!customApiUrl || !customApiUrl.trim()) {
    return originalModel;
  }

  if (!cachedModelMapping) {
    await loadModelMapping();
  }

  const mapping = cachedModelMapping!;
  const lowerModel = originalModel.toLowerCase();

  // Check for Opus models (highest priority)
  if (lowerModel.includes('opus') && mapping.opus) {
    return mapping.opus;
  }

  // Check for Sonnet models
  if (lowerModel.includes('sonnet') && mapping.sonnet) {
    return mapping.sonnet;
  }

  // Check for Haiku models
  if (lowerModel.includes('haiku') && mapping.haiku) {
    return mapping.haiku;
  }

  // Return original model if no mapping found
  return originalModel;
}

/**
 * Clear cached model mapping (call when storage changes)
 */
export function clearModelMappingCache(): void {
  cachedModelMapping = null;
}

/**
 * Get mapped model name for display purposes (synchronous)
 * Returns the mapped model name if configured, empty string otherwise
 */
export function getMappedModelName(originalModel: string, mapping: ModelMappingConfig): string {
  const lowerModel = originalModel.toLowerCase();

  if (lowerModel.includes('opus') && mapping.opus) {
    return mapping.opus;
  }

  if (lowerModel.includes('sonnet') && mapping.sonnet) {
    return mapping.sonnet;
  }

  if (lowerModel.includes('haiku') && mapping.haiku) {
    return mapping.haiku;
  }

  return '';
}

/**
 * Listen for storage changes and clear cache
 */
export function initModelMappingListener(): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    const mappingKeys = Object.values(MODEL_MAPPING_KEYS);
    const hasModelMappingChange = mappingKeys.some(key => key in changes);

    if (hasModelMappingChange) {
      clearModelMappingCache();
    }
  });
}
