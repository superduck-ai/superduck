import { getFirstUsableProvider } from '@/utils/providerConfigStatus';
import { loadProviderConfig, type ProviderConfig } from '@/utils/providerStore';

export interface SchedulingProviderOption {
  value: string;
  label: string;
}

export function getSchedulingProviderOptions(config: ProviderConfig): SchedulingProviderOption[] {
  const seen = new Set<string>();
  const options: SchedulingProviderOption[] = [];

  for (const provider of config.providers) {
    const value = provider.id.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const label = provider.name.trim() || provider.modelId.trim() || value;
    options.push({ value, label });
  }

  return options;
}

export function getDefaultSchedulingProviderId(config: ProviderConfig): string {
  return getFirstUsableProvider(config)?.id || config.providers[0]?.id || '';
}

export function ensureSelectedSchedulingProviderOption(
  options: SchedulingProviderOption[],
  selectedValue: string
): SchedulingProviderOption[] {
  const selected = selectedValue.trim();
  if (!selected || options.some((option) => option.value === selected)) return options;
  return [{ value: selected, label: selected }, ...options];
}

export async function loadSchedulingProviderChoices(): Promise<{
  defaultProviderId: string;
  options: SchedulingProviderOption[];
}> {
  const config = await loadProviderConfig();
  return {
    defaultProviderId: getDefaultSchedulingProviderId(config),
    options: getSchedulingProviderOptions(config)
  };
}
