import {
  getOrCreateAnonymousId,
  getConfig,
  getStorageValue,
  removeStorageValues,
  StorageKeys
} from '../extensionServices';

// ---------------------------------------------------------------------------
// PostHog lightweight HTTP client
//
// Replaces the previous Segment Analytics client. Sends events directly to
// PostHog's /capture/ endpoint via fetch(). Each call fires a single POST
// (no batching) so we never hold the Service Worker alive with pending queues.
// Failures are silently ignored — analytics is best-effort.
// ---------------------------------------------------------------------------

const POSTHOG_HOST = 'https://us.i.posthog.com';
const POSTHOG_API_KEY = 'phc_usrQSJ4QknZBB8iZT9jmJZE5XixypAwvFn49dB8wFSss';

export function analyticsSourceForEvent(event: string): string {
  if (event.startsWith('superduck.mcp.')) return 'mcp';
  if (event.startsWith('superduck.sidebar.') || event.startsWith('superduck.chat.')) {
    return 'sidepanel';
  }
  if (event.startsWith('superduck.bridge.')) return 'bridge';
  return 'extension';
}

export function posthogLibForSource(source: string): string {
  switch (source) {
    case 'mcp':
      return 'superduck-mcp';
    case 'sidepanel':
      return 'superduck-sidepanel';
    case 'bridge':
      return 'superduck-bridge';
    default:
      return 'superduck-extension';
  }
}

async function posthogCapture(
  event: string,
  properties: Record<string, unknown> = {}
): Promise<void> {
  try {
    const anonymousId = await getOrCreateAnonymousId();
    if (!anonymousId) return;

    const extensionVersion = chrome.runtime.getManifest().version;
    const analyticsSource = analyticsSourceForEvent(event);
    const payload: Record<string, unknown> = {
      api_key: POSTHOG_API_KEY,
      event,
      distinct_id: anonymousId,
      timestamp: new Date().toISOString(),
      properties: {
        ...properties,
        $lib: posthogLibForSource(analyticsSource),
        $lib_version: extensionVersion,
        analytics_source: analyticsSource,
        extension_version: extensionVersion
      }
    };
    void fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch {
    // best-effort
  }
}

// --- initializeAnalytics ---
const initializeAnalytics = async (): Promise<void> => {
  void getOrCreateAnonymousId().catch(() => {});
};

// --- trackEvent --- EXPORT
export const trackEvent = async (
  eventName: string,
  properties: Record<string, unknown> = {}
): Promise<void> => {
  await posthogCapture(eventName, properties);
};

// ---------------------------------------------------------------------------
// Feature Flags — minimal inline manager
// ---------------------------------------------------------------------------

interface FeatureResponse {
  features: Record<string, unknown>;
}

function isFeatureResponse(data: unknown): data is FeatureResponse {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return 'features' in obj && typeof obj.features === 'object' && obj.features !== null;
}

class FeatureFlagManager {
  private features: Record<string, unknown> | null = null;
  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.features) return;
    if (!this.initPromise) {
      this.initPromise = this.fetchAndStore();
    }
    await this.initPromise;
  }

  async refresh(): Promise<void> {
    this.initPromise = this.fetchAndStore();
    await this.initPromise;
  }

  getFeatureValue<T>(name: string, defaultValue: T): T {
    if (!this.features) return defaultValue;
    const value = this.features[name];
    if (value === undefined || value === null) return defaultValue;
    return value as T;
  }

  private async fetchAndStore(): Promise<void> {
    try {
      const config = getConfig();
      const token = await getStorageValue<string>(StorageKeys.ACCESS_TOKEN);
      if (!token) {
        this.initPromise = null;
        return;
      }
      const response = await fetch(`${config.apiBaseUrl}/api/bootstrap/features/claude_in_chrome`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (401 === response.status) {
        await removeStorageValues([StorageKeys.ACCESS_TOKEN, StorageKeys.TOKEN_EXPIRY]);
        this.initPromise = null;
        this.features = null;
        return;
      }
      if (!response.ok) {
        this.initPromise = null;
        return;
      }
      const responseBody: unknown = await response.json();
      if (isFeatureResponse(responseBody)) {
        this.features = responseBody.features as Record<string, unknown>;
      }
    } catch {
      // best-effort
    }
  }
}

let featureFlagManager: FeatureFlagManager | null = null;

function getFeatureFlagManager(): FeatureFlagManager {
  if (!featureFlagManager) {
    featureFlagManager = new FeatureFlagManager();
  }
  return featureFlagManager;
}

// --- getFeatureValue --- EXPORT
export async function getFeatureValue(featureName: string): Promise<Record<string, unknown>> {
  const manager = getFeatureFlagManager();
  await manager.initialize();
  const result = manager.getFeatureValue<Record<string, unknown>>(featureName, {});
  const isNonEmpty =
    result &&
    typeof result === 'object' &&
    Object.keys(result).some((key) => result[key] !== undefined && result[key] !== null);
  return isNonEmpty ? result : {};
}

// --- refreshFeatures --- EXPORT
export async function refreshFeatures(): Promise<void> {
  const manager = getFeatureFlagManager();
  await manager.refresh();
}

export { getFeatureFlagManager, initializeAnalytics };
