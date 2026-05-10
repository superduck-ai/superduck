import React from 'react';
import { apiClient } from './apiClient';

interface FeatureFlagConfig {
  fetchFeatures: () => Promise<any>;
  onFeaturesUpdated?: (features: any) => void;
  cacheTTL?: number;
  storageKey?: string;
}

export class FeatureFlagManager {
  private config: Required<Pick<FeatureFlagConfig, 'cacheTTL' | 'storageKey'>> &
    FeatureFlagConfig;
  private features: Record<string, any> | null = null;
  private cacheTimestamp: number | null = null;
  private initPromise: Promise<void> | null = null;
  private isRefreshing = false;

  constructor(config: FeatureFlagConfig) {
    this.config = {
      ...config,
      cacheTTL: config.cacheTTL ?? 300000,
      storageKey: config.storageKey ?? 'features'
    };
  }

  setOnFeaturesUpdated(callback: (features: any) => void): void {
    this.config.onFeaturesUpdated = callback;
  }

  private async loadFromCache(): Promise<any | null> {
    try {
      const stored = (await chrome.storage.local.get(this.config.storageKey))[this.config.storageKey] as
        | { payload?: any; timestamp?: number }
        | undefined;
      if (stored?.payload && stored?.timestamp) {
        if (Date.now() - stored.timestamp < this.config.cacheTTL) return stored;
      }
    } catch {
      // ignore
    }
    return null;
  }

  private async saveToCache(payload: any): Promise<void> {
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

  getFeatureValue(key: string, defaultValue?: any): any {
    this.checkAndRefreshIfStale();
    const feature = this.features?.[key];
    return feature && feature.value !== undefined && feature.value !== null
      ? feature.value
      : defaultValue;
  }

  async getFeatureValueAsync(key: string, defaultValue?: any): Promise<any> {
    await this.checkAndRefreshIfStale();
    const feature = this.features?.[key];
    return feature && feature.value !== undefined && feature.value !== null
      ? feature.value
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

  getFeature(key: string): any {
    this.checkAndRefreshIfStale();
    return this.features?.[key];
  }

  async getFeatureAsync(key: string): Promise<any> {
    await this.checkAndRefreshIfStale();
    return this.features?.[key];
  }

  async refresh(): Promise<void> {
    await this.fetchAndUpdate();
  }

  isReady(): boolean {
    return this.features !== null;
  }
}

async function fetchBootstrapFeatures(): Promise<any> {
  return apiClient.fetch('/api/bootstrap/features/claude_in_chrome');
}

interface FeatureContextValue {
  isReady: boolean;
  error: Error | null;
  getFeatureValue: (key: string, defaultValue?: any) => any;
  isFeatureEnabled: (key: string) => boolean;
  getFeature: (key: string) => any;
  hasFeature: (key: string) => boolean;
  refresh: () => Promise<void>;
}

let sharedManager: FeatureFlagManager | null = null;
const FeatureContext = React.createContext<FeatureContextValue | null>(null);

export function FeatureProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [features, setFeatures] = React.useState<any>(null);
  const [isReady, setIsReady] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const managerRef = React.useRef<FeatureFlagManager | null>(null);

  React.useEffect(() => {
    const onUpdate = (nextFeatures: any) => {
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

  const getFeatureValue = React.useCallback(
    (key: string, defaultValue?: any) =>
      managerRef.current ? managerRef.current.getFeatureValue(key, defaultValue) : defaultValue,
    [features]
  );
  const isFeatureEnabled = React.useCallback(
    (key: string) => !!managerRef.current && managerRef.current.isFeatureEnabled(key),
    [features]
  );
  const getFeature = React.useCallback((key: string) => managerRef.current?.getFeature(key), [features]);
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

export function useFeatureValue(key: string, defaultValue?: any): any {
  const { getFeatureValue } = useFeatures();
  return getFeatureValue(key, defaultValue);
}

export function useFeatureEnabled(key: string): boolean {
  const { isFeatureEnabled } = useFeatures();
  return isFeatureEnabled(key);
}

export function useIsReady(): boolean {
  const { isReady } = useFeatures();
  return isReady;
}
