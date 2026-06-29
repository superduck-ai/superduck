import { StorageKeys, type PurlConfigFeatureValue, getStorageValue } from '../../extensionServices';
import { LIGHTNING_DEFAULT_CONFIG } from './runtime';
import { isRecord } from '../../messageTypes';

export class LightningConfigController {
  modelOverride: string | null = null;
  effort: string = 'high';
  pageSettleMs: number = 100;
  imageFormat: 'jpeg' | 'png' | 'webp' = 'jpeg';
  imageQuality: number = 85;
  maxImageDimension: number = 1568;
  screenshotHistory: number = 1;

  private apiBaseUrl = '';
  private listener:
    | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
    | null = null;

  async load(purlConfigFeature: PurlConfigFeatureValue | null): Promise<string> {
    const stored =
      (await getStorageValue<PurlConfigFeatureValue | null>(StorageKeys.PURL_CONFIG)) ||
      purlConfigFeature;
    const merged: PurlConfigFeatureValue = {
      ...LIGHTNING_DEFAULT_CONFIG,
      ...((stored && typeof stored === 'object' ? stored : {}) as PurlConfigFeatureValue)
    };
    this.applyConfig(merged);
    this.apiBaseUrl = merged.apiBaseUrl || '';
    return this.apiBaseUrl;
  }

  startStorageListener(onConfigChanged: () => void): void {
    this.listener = (changes, areaName) => {
      if (areaName !== 'local' || !(StorageKeys.PURL_CONFIG in changes)) return;
      const nextConfigValue = changes[StorageKeys.PURL_CONFIG]?.newValue;
      const newConfig: PurlConfigFeatureValue = {
        ...LIGHTNING_DEFAULT_CONFIG,
        ...(isRecord(nextConfigValue) ? nextConfigValue : {})
      };
      this.applyConfig(newConfig);
      onConfigChanged();
    };
    chrome.storage.onChanged.addListener(this.listener);
  }

  stopStorageListener(): void {
    if (this.listener) {
      chrome.storage.onChanged.removeListener(this.listener);
      this.listener = null;
    }
  }

  private applyConfig(merged: PurlConfigFeatureValue): void {
    this.modelOverride = merged.modelOverride || null;
    this.effort = merged.effort || 'high';
    this.pageSettleMs = merged.pageSettleMs ?? 100;
    this.imageFormat = merged.imageFormat ?? 'jpeg';
    this.imageQuality = merged.imageQuality ?? 85;
    this.maxImageDimension = merged.maxImageDimension ?? 1568;
    this.screenshotHistory = merged.screenshotHistory ?? 1;
  }
}
