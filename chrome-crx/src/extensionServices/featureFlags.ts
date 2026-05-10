import React from 'react';
import { apiClient } from './apiClient';

export interface FeatureFlagEntry<TValue = unknown> {
  on?: boolean;
  value?: TValue;
  [key: string]: unknown;
}

export type FeatureCollection = Record<string, FeatureFlagEntry>;

export interface ModelOptionConfig {
  model: string;
  name?: string;
  effort_options?: string[];
  [key: string]: unknown;
}

export interface ModelFallbackConfig {
  fallbackModelName?: string;
  currentModelName?: string;
  fallbackDisplayName?: string;
  learnMoreUrl?: string;
  [key: string]: unknown;
}

export interface ModelsConfigFeatureValue {
  default?: string;
  options?: Array<string | ModelOptionConfig>;
  small_fast_model?: string;
  modelFallbacks?: Record<string, ModelFallbackConfig>;
  [key: string]: unknown;
}

export interface VersionInfoFeatureValue {
  min_supported_version?: string;
  [key: string]: unknown;
}

export interface AnnouncementFeatureValue {
  enabled?: boolean;
  text?: string;
  id?: string;
  [key: string]: unknown;
}

export interface PurlConfigFeatureValue {
  systemPrompt?: string;
  apiBaseUrl?: string;
  modelOverride?: string;
  effort?: string;
  pageSettleMs?: number;
  imageFormat?: 'jpeg' | 'png' | 'webp';
  imageQuality?: number;
  maxImageDimension?: number;
  screenshotHistory?: number;
  [key: string]: unknown;
}

export interface KnownFeatureValueMap {
  chrome_ext_models: ModelsConfigFeatureValue;
  chrome_ext_version_info: VersionInfoFeatureValue;
  chrome_ext_announcement: AnnouncementFeatureValue;
  chrome_ext_flash_enabled: boolean;
  chrome_ext_purl_prompt: string;
  chrome_ext_purl_config: PurlConfigFeatureValue;
  crochet_chips: Record<string, unknown>;
}

export interface FeatureResponse<TFeatures extends FeatureCollection = FeatureCollection> {
  features: TFeatures;
  [key: string]: unknown;
}

interface FeatureCacheEntry<TFeatures extends FeatureCollection = FeatureCollection> {
  payload?: FeatureResponse<TFeatures>;
  timestamp?: number;
}

interface CachedFeatureRecord<TFeatures extends FeatureCollection = FeatureCollection> {
  payload: FeatureResponse<TFeatures>;
  timestamp: number;
}

interface FeatureFlagConfig<TFeatures extends FeatureCollection = FeatureCollection> {
  fetchFeatures: () => Promise<FeatureResponse<TFeatures>>;
  onFeaturesUpdated?: (features: TFeatures) => void;
  cacheTTL?: number;
  storageKey?: string;
}

export class FeatureFlagManager<TFeatures extends FeatureCollection = FeatureCollection> {
  private config: Required<Pick<FeatureFlagConfig, 'cacheTTL' | 'storageKey'>> &
    FeatureFlagConfig<TFeatures>;
  private features: TFeatures | null = null;
  private cacheTimestamp: number | null = null;
  private initPromise: Promise<void> | null = null;
  private isRefreshing = false;

  constructor(config: FeatureFlagConfig<TFeatures>) {
    this.config = {
      ...config,
      cacheTTL: config.cacheTTL ?? 300000,
      storageKey: config.storageKey ?? 'features'
    };
  }

  setOnFeaturesUpdated(callback: (features: TFeatures) => void): void {
    this.config.onFeaturesUpdated = callback;
  }

  private async loadFromCache(): Promise<CachedFeatureRecord<TFeatures> | null> {
    try {
      const stored = (await chrome.storage.local.get(this.config.storageKey))[
        this.config.storageKey
      ] as FeatureCacheEntry<TFeatures> | undefined;
      if (stored?.payload && typeof stored.timestamp === 'number') {
        if (Date.now() - stored.timestamp < this.config.cacheTTL) {
          return {
            payload: stored.payload,
            timestamp: stored.timestamp
          };
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  private async saveToCache(payload: FeatureResponse<TFeatures>): Promise<void> {
    try {
      await chrome.storage.local.set({
        [this.config.storageKey]: { payload, timestamp: Date.now() }
      });
    } catch {
      // ignore
    }
  }

  private async fetchAndUpdate(): Promise<void> {
    const data = await this.config.fetchFeatures();
    this.features = data.features;
    this.cacheTimestamp = Date.now();
    await this.saveToCache(data);
    this.config.onFeaturesUpdated?.(data.features);
  }

  checkAndRefreshIfStale(): void {
    if (!this.cacheTimestamp || this.isRefreshing) return;
    if (Date.now() - this.cacheTimestamp > this.config.cacheTTL) {
      this.isRefreshing = true;
      this.fetchAndUpdate()
        .catch(() => {})
        .finally(() => {
          this.isRefreshing = false;
        });
    }
  }

  async initialize(): Promise<void> {
    if (this.features) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const cached = await this.loadFromCache();
        if (cached) {
          this.features = cached.payload.features;
          this.cacheTimestamp = cached.timestamp;
          this.config.onFeaturesUpdated?.(cached.payload.features);
          if (Date.now() - cached.timestamp > this.config.cacheTTL / 2) {
            this.isRefreshing = true;
            try {
              await this.fetchAndUpdate();
            } catch {
              // ignore
            } finally {
              this.isRefreshing = false;
            }
          }
          return;
        }
        try {
          await this.fetchAndUpdate();
        } catch {
          // ignore
        }
      })();
    }
    return this.initPromise;
  }

  getFeatureValue<T>(key: string, defaultValue?: T): T | undefined {
    this.checkAndRefreshIfStale();
    const feature = this.features?.[key];
    return feature && feature.value !== undefined && feature.value !== null
      ? (feature.value as T)
      : defaultValue;
  }

  async getFeatureValueAsync<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    await this.checkAndRefreshIfStale();
    const feature = this.features?.[key];
    return feature && feature.value !== undefined && feature.value !== null
      ? (feature.value as T)
      : defaultValue;
  }

  isFeatureEnabled(key: string): boolean {
    this.checkAndRefreshIfStale();
    return this.features?.[key]?.on ?? false;
  }

  async isFeatureEnabledAsync(key: string): Promise<boolean> {
    await this.checkAndRefreshIfStale();
    return this.features?.[key]?.on ?? false;
  }

  getFeature<T extends FeatureFlagEntry = FeatureFlagEntry>(key: string): T | undefined {
    this.checkAndRefreshIfStale();
    return this.features?.[key] as T | undefined;
  }

  async getFeatureAsync<T extends FeatureFlagEntry = FeatureFlagEntry>(
    key: string
  ): Promise<T | undefined> {
    await this.checkAndRefreshIfStale();
    return this.features?.[key] as T | undefined;
  }

  async refresh(): Promise<void> {
    await this.fetchAndUpdate();
  }

  isReady(): boolean {
    return this.features !== null;
  }
}

async function fetchBootstrapFeatures(): Promise<FeatureResponse> {
  return (await apiClient.fetch('/api/bootstrap/features/claude_in_chrome')) as FeatureResponse;
}

interface FeatureContextValue {
  isReady: boolean;
  error: Error | null;
  getFeatureValue: <T>(key: string, defaultValue?: T) => T | undefined;
  isFeatureEnabled: (key: string) => boolean;
  getFeature: (key: string) => FeatureFlagEntry | undefined;
  hasFeature: (key: string) => boolean;
  refresh: () => Promise<void>;
}

let sharedManager: FeatureFlagManager | null = null;
const FeatureContext = React.createContext<FeatureContextValue | null>(null);

export function FeatureProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [features, setFeatures] = React.useState<FeatureCollection | null>(null);
  const [isReady, setIsReady] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const managerRef = React.useRef<FeatureFlagManager | null>(null);

  React.useEffect(() => {
    const onUpdate = (nextFeatures: FeatureCollection) => {
      setFeatures(nextFeatures);
      setError(null);
    };

    if (!sharedManager) {
      sharedManager = new FeatureFlagManager({
        fetchFeatures: fetchBootstrapFeatures,
        onFeaturesUpdated: onUpdate
      });
    }

    const manager = sharedManager;
    managerRef.current = manager;
    manager.setOnFeaturesUpdated(onUpdate);
    manager
      .initialize()
      .then(() => setIsReady(true))
      .catch((err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsReady(true);
      });
  }, []);

  const getFeatureValue: FeatureContextValue['getFeatureValue'] = React.useCallback(
    (key: string, defaultValue?: any) =>
      managerRef.current ? managerRef.current.getFeatureValue(key, defaultValue) : defaultValue,
    [features]
  );
  const isFeatureEnabled = React.useCallback(
    (key: string) => !!managerRef.current && managerRef.current.isFeatureEnabled(key),
    [features]
  );
  const getFeature: FeatureContextValue['getFeature'] = React.useCallback(
    (key: string) => managerRef.current?.getFeature(key),
    [features]
  );
  const hasFeature = React.useCallback((key: string) => features?.[key] !== undefined, [features]);
  const refresh = React.useCallback(async () => {
    if (managerRef.current) await managerRef.current.refresh();
  }, []);

  const value = React.useMemo(
    () => ({
      isReady,
      error,
      getFeatureValue,
      isFeatureEnabled,
      getFeature,
      hasFeature,
      refresh
    }),
    [error, getFeature, getFeatureValue, hasFeature, isFeatureEnabled, isReady, refresh]
  );

  return React.createElement(FeatureContext.Provider, { value }, children);
}

export function useFeatures(): FeatureContextValue {
  const context = React.useContext(FeatureContext);
  if (!context) {
    throw new Error('useFeatures must be used within a FeatureProvider');
  }
  return context;
}

export function useFeatureValue<K extends keyof KnownFeatureValueMap>(
  key: K,
  defaultValue: KnownFeatureValueMap[K]
): KnownFeatureValueMap[K];
export function useFeatureValue<K extends keyof KnownFeatureValueMap>(
  key: K,
  defaultValue: KnownFeatureValueMap[K] | null
): KnownFeatureValueMap[K] | null;
export function useFeatureValue<T>(key: string, defaultValue: T): T;
export function useFeatureValue<T>(key: string, defaultValue: T): T {
  const { getFeatureValue } = useFeatures();
  return getFeatureValue(key, defaultValue) ?? defaultValue;
}

export function useFeatureEnabled(key: string): boolean {
  const { isFeatureEnabled } = useFeatures();
  return isFeatureEnabled(key);
}

export function useIsReady(): boolean {
  const { isReady } = useFeatures();
  return isReady;
}
