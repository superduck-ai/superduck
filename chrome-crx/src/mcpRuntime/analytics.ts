import {
  StorageKeys,
  removeStorageValues,
  getStorageValue,
  getConfig,
  getOrCreateAnonymousId
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

let analyticsUserId: string | null = null;
let identifyPromise: Promise<void> | null = null;

function ensureIdentified(): Promise<void> {
  if (!identifyPromise) {
    identifyPromise = identifyUser();
  }
  return identifyPromise;
}

async function posthogCapture(
  event: string,
  properties: Record<string, unknown> = {}
): Promise<void> {
  try {
    await ensureIdentified();
    const anonymousId = await getOrCreateAnonymousId();
    const extensionVersion = chrome.runtime.getManifest().version;
    const payload: Record<string, unknown> = {
      api_key: POSTHOG_API_KEY,
      event,
      distinct_id: analyticsUserId || anonymousId,
      timestamp: new Date().toISOString(),
      properties: {
        ...properties,
        $lib: 'superduck-extension',
        $lib_version: extensionVersion,
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
  await ensureIdentified();
};

// --- identifyUser ---
const identifyUser = async (): Promise<void> => {
  try {
    analyticsUserId = null;
    const token = await getStorageValue<string>(StorageKeys.ACCESS_TOKEN);
    if (!token) return;
    const profileUrl = `${getConfig().apiBaseUrl}/api/oauth/profile`;
    const response = await fetch(profileUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (401 === response.status) {
      await removeStorageValues([StorageKeys.ACCESS_TOKEN, StorageKeys.TOKEN_EXPIRY]);
      return;
    }
    if (!response.ok) return;
    const profile = await response.json();
    const userId = profile?.account?.uuid;
    if (!userId) return;
    analyticsUserId = userId;

    const anonymousId = await getOrCreateAnonymousId();
    const extensionVersion = chrome.runtime.getManifest().version;
    const traits: Record<string, unknown> = {
      email: profile.account?.email,
      name: profile.account?.name,
      organizationId: profile.organization?.uuid,
      organizationType: profile.organization?.organization_type,
      hasClaudeMax: profile.account?.has_claude_max,
      hasClaudePro: profile.account?.has_claude_pro,
      extensionVersion
    };

    void fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_API_KEY,
        event: '$identify',
        distinct_id: userId,
        timestamp: new Date().toISOString(),
        properties: {
          $anon_distinct_id: anonymousId,
          $set: traits
        }
      })
    }).catch(() => {});
  } catch {
    // silently fail
  }
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
      if (!token) return;
      const response = await fetch(`${config.apiBaseUrl}/api/bootstrap/features/claude_in_chrome`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (401 === response.status) {
        await removeStorageValues([StorageKeys.ACCESS_TOKEN, StorageKeys.TOKEN_EXPIRY]);
        return;
      }
      if (!response.ok) return;
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

export { getFeatureFlagManager, initializeAnalytics, identifyUser };
