import { getOrCreateAnonymousId } from '../../extensionServices';

// PostHog lightweight HTTP client — sends events directly to /capture/ via
// fetch(). Best-effort: failures are silently ignored.
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

const initializeAnalytics = async (): Promise<void> => {
  void getOrCreateAnonymousId().catch(() => {});
};

export const trackEvent = async (
  eventName: string,
  properties: Record<string, unknown> = {}
): Promise<void> => {
  await posthogCapture(eventName, properties);
};

export { initializeAnalytics };
