import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { analyticsSourceForEvent, posthogLibForSource, trackEvent } from './analytics';
import { getOrCreateAnonymousId, setSharedAnalyticsId } from '../extensionServices/analytics';

function installChromeStorageMock(initial: Record<string, unknown> = {}) {
  const store = { ...initial };
  const listeners = new Set<
    (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void
  >();
  vi.stubGlobal('chrome', {
    runtime: {
      getManifest: () => ({ version: '1.2.3' })
    },
    storage: {
      onChanged: {
        addListener: vi.fn((listener) => {
          listeners.add(listener);
        }),
        removeListener: vi.fn((listener) => {
          listeners.delete(listener);
        })
      },
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (values: Record<string, unknown>) => {
          const changes: Record<string, chrome.storage.StorageChange> = {};
          for (const [key, newValue] of Object.entries(values)) {
            changes[key] = { oldValue: store[key], newValue };
          }
          Object.assign(store, values);
          for (const listener of listeners) listener(changes, 'local');
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          const changes: Record<string, chrome.storage.StorageChange> = {};
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            changes[key] = { oldValue: store[key], newValue: undefined };
            delete store[key];
          }
          for (const listener of listeners) listener(changes, 'local');
        })
      }
    }
  });
  return store;
}

describe('analytics source attribution', () => {
  it('keeps MCP, sidepanel, bridge, and extension events in separate PostHog libs', () => {
    expect(analyticsSourceForEvent('superduck.mcp.tool_called')).toBe('mcp');
    expect(posthogLibForSource('mcp')).toBe('superduck-mcp');

    expect(analyticsSourceForEvent('superduck.sidebar.opened')).toBe('sidepanel');
    expect(analyticsSourceForEvent('superduck.chat.tool_called')).toBe('sidepanel');
    expect(posthogLibForSource('sidepanel')).toBe('superduck-sidepanel');

    expect(analyticsSourceForEvent('superduck.bridge.connected')).toBe('bridge');
    expect(posthogLibForSource('bridge')).toBe('superduck-bridge');

    expect(analyticsSourceForEvent('superduck.extension.update_available')).toBe('extension');
    expect(posthogLibForSource('extension')).toBe('superduck-extension');
  });
});

describe('shared analytics id', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the native-host shared install id when it is available', async () => {
    installChromeStorageMock();

    await setSharedAnalyticsId('sdid-native-host');

    await expect(getOrCreateAnonymousId()).resolves.toBe('sdid-native-host');
  });

  it('does not overwrite the shared install id with an anon fallback', async () => {
    const store = installChromeStorageMock({ analyticsId: 'sdid-existing' });

    await expect(getOrCreateAnonymousId()).resolves.toBe('sdid-existing');
    expect(store.anonymousId).toBeUndefined();
  });

  it('clears legacy anon storage when native id is unavailable', async () => {
    vi.useFakeTimers();
    const store = installChromeStorageMock({ anonymousId: 'anon-legacy' });
    vi.stubGlobal('crypto', { randomUUID: () => '11691c46-528b-4759-bb0e-133fabb73666' });

    const idPromise = getOrCreateAnonymousId();
    await vi.advanceTimersByTimeAsync(350);

    await expect(idPromise).resolves.toBe('sdid-11691c46528b4759bb0e133fabb73666');
    expect(store.analyticsId).toBe('sdid-11691c46528b4759bb0e133fabb73666');
    expect(store.anonymousId).toBe('sdid-11691c46528b4759bb0e133fabb73666');
  });

  it('captures PostHog events with an extension-created sdid when native id is unavailable', async () => {
    vi.useFakeTimers();
    const store = installChromeStorageMock({ anonymousId: 'anon-legacy' });
    vi.stubGlobal('crypto', { randomUUID: () => '11691c46-528b-4759-bb0e-133fabb73666' });
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const eventPromise = trackEvent('superduck.sidebar.opened', {});
    await vi.advanceTimersByTimeAsync(350);

    await eventPromise;
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    expect(payload.distinct_id).toBe('sdid-11691c46528b4759bb0e133fabb73666');
    expect(store.analyticsId).toBe('sdid-11691c46528b4759bb0e133fabb73666');
    expect(store.anonymousId).toBe('sdid-11691c46528b4759bb0e133fabb73666');
  });
});
