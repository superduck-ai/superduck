import {
  isProviderComplete,
  type AiProvider,
  type ModelMappingV2,
  type ProviderConfig,
  type Tier
} from './providerStore';

export const PROVIDER_SETUP_TIER_ORDER: Tier[] = ['deep', 'smart', 'flash'];

export function isProviderReadyForSetup(provider: AiProvider): boolean {
  return isProviderComplete(provider) && provider.status !== 'error';
}

export function getBoundProvider(config: ProviderConfig, tier: Tier): AiProvider | undefined {
  const binding = config.mapping[tier];
  if (!binding) return undefined;
  return config.providers.find((provider) => provider.id === binding.providerId);
}

export function isTierBoundToUsableProvider(config: ProviderConfig, tier: Tier): boolean {
  const binding = config.mapping[tier];
  const provider = getBoundProvider(config, tier);
  if (!binding || !provider || !isProviderReadyForSetup(provider)) return false;
  return Boolean((binding.modelId || provider.modelId).trim());
}

export function isProviderConfigUsable(config: ProviderConfig): boolean {
  if (!config.providers.some(isProviderReadyForSetup)) return false;
  return PROVIDER_SETUP_TIER_ORDER.every((tier) => isTierBoundToUsableProvider(config, tier));
}

export function parseProviderConfigSnapshot(snapshot: string): ProviderConfig | null {
  try {
    const parsed = JSON.parse(snapshot) as ProviderConfig;
    if (!Array.isArray(parsed.providers) || !parsed.mapping) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getUpdatedMappingForProviderSave(
  previous: ProviderConfig,
  nextProvider: AiProvider,
  existingProviderIndex: number
): ModelMappingV2 {
  const nextMapping = { ...previous.mapping } as ModelMappingV2;

  PROVIDER_SETUP_TIER_ORDER.forEach((tier) => {
    if (nextMapping[tier]?.providerId === nextProvider.id) {
      nextMapping[tier] = { providerId: nextProvider.id, modelId: nextProvider.modelId };
    }
  });

  if (
    existingProviderIndex < 0 &&
    !isProviderConfigUsable(previous) &&
    isProviderReadyForSetup(nextProvider)
  ) {
    PROVIDER_SETUP_TIER_ORDER.forEach((tier) => {
      nextMapping[tier] = { providerId: nextProvider.id, modelId: nextProvider.modelId };
    });
  }

  return nextMapping;
}
