import { isProviderComplete, type AiProvider, type ProviderConfig } from './providerStore';

export function isProviderReadyForSetup(provider: AiProvider): boolean {
  return isProviderComplete(provider) && provider.status !== 'error';
}

export function isProviderConfigUsable(config: ProviderConfig): boolean {
  return config.providers.some(isProviderReadyForSetup);
}

/**
 * Return the first provider that is ready to serve requests, or undefined.
 * Used to seed a default selection when the user has not yet picked one.
 */
export function getFirstUsableProvider(config: ProviderConfig): AiProvider | undefined {
  return config.providers.find(isProviderReadyForSetup);
}

export function parseProviderConfigSnapshot(snapshot: string): ProviderConfig | null {
  try {
    const parsed = JSON.parse(snapshot) as ProviderConfig;
    if (!Array.isArray(parsed.providers)) return null;
    return parsed;
  } catch {
    return null;
  }
}
