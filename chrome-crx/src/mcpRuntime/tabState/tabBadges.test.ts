import { beforeEach, describe, expect, it, vi } from 'vitest';

const chromeMock = vi.hoisted(() => {
  const sessionStore = new Map<string, unknown>();
  const localStore = new Map<string, unknown>([['extensionInstanceId', 'instance-test']]);
  let activatedListener: ((activeInfo: { tabId: number }) => void) | undefined;
  let updatedListener:
    | ((tabId: number, changeInfo: Record<string, unknown>, tab: unknown) => void)
    | undefined;
  let removedListener: ((tabId: number) => void) | undefined;

  const storageArea = (store: Map<string, unknown>) => ({
    get: vi.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      return Object.fromEntries(keys.map((item) => [item, store.get(item)]));
    }),
    set: vi.fn(async (values: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(values)) store.set(key, value);
    }),
    remove: vi.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      for (const item of keys) store.delete(item);
    })
  });

  return {
    sessionStore,
    localStore,
    tabs: {
      get: vi.fn(async (tabId: number) => ({ id: tabId, url: 'https://example.com/' })),
      query: vi.fn(async () => []),
      onUpdated: { addListener: vi.fn((l: typeof updatedListener) => (updatedListener = l)) },
      onActivated: { addListener: vi.fn((l: typeof activatedListener) => (activatedListener = l)) },
      onRemoved: { addListener: vi.fn((l: typeof removedListener) => (removedListener = l)) }
    },
    storage: {
      session: storageArea(sessionStore),
      local: storageArea(localStore)
    },
    action: {
      setBadgeText: vi.fn(async (_details: { tabId: number; text: string }) => {}),
      setBadgeBackgroundColor: vi.fn(async (_details: { tabId: number; color: string }) => {})
    },
    fireActivated(tabId: number) {
      activatedListener?.({ tabId });
    },
    fireRemoved(tabId: number) {
      removedListener?.(tabId);
    }
  };
});

vi.stubGlobal('chrome', chromeMock);

async function flush(): Promise<void> {
  // Drain the queueMicrotask used by scheduleRefresh + the async applyBadge.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('tabBadgeManager', () => {
  let tabLeaseManager: typeof import('./tabLeases').tabLeaseManager;
  let tabBadgeManager: typeof import('./tabBadges').tabBadgeManager;

  beforeEach(async () => {
    vi.resetModules();
    chromeMock.sessionStore.clear();
    chromeMock.tabs.get.mockClear();
    chromeMock.tabs.query.mockClear();
    chromeMock.action.setBadgeText.mockClear();
    chromeMock.action.setBadgeBackgroundColor.mockClear();
    chromeMock.storage.session.get.mockClear();
    chromeMock.storage.session.set.mockClear();

    ({ tabLeaseManager } = await import('./tabLeases'));
    ({ tabBadgeManager } = await import('./tabBadges'));
    await tabBadgeManager.initialize();
  });

  it('shows the active badge when a tab lease becomes active and clears it on release', async () => {
    await tabLeaseManager.claimTab('session-a', 'turn-1', 10, 'agent');
    await flush();

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 10, text: '●' })
    );

    await tabLeaseManager.releaseTabs('session-a', [10]);
    await flush();

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 10, text: '' })
    );
  });

  it('does not badge a handoff lease', async () => {
    await tabLeaseManager.claimTab('session-a', 'turn-1', 10, 'agent');
    await flush();
    chromeMock.action.setBadgeText.mockClear();

    await tabLeaseManager.handoffTabs('session-a', 'turn-1', [10]);
    await flush();

    // Handoff state clears the active badge (handoff is not badged).
    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 10, text: '' })
    );
  });

  it('marks deliverable tabs and clears the badge when the user activates them', async () => {
    await tabBadgeManager.markDeliverable([20]);
    await flush();

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 20, text: '✓' })
    );
    expect(chromeMock.sessionStore.get('tabDeliverableBadges')).toMatchObject({
      tabIds: [20]
    });

    chromeMock.action.setBadgeText.mockClear();
    chromeMock.fireActivated(20);
    await flush();

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 20, text: '' })
    );
    expect(chromeMock.sessionStore.get('tabDeliverableBadges')).toMatchObject({
      tabIds: []
    });
  });

  it('deliverable badge takes precedence over an active lease on the same tab', async () => {
    await tabLeaseManager.claimTab('session-a', 'turn-1', 30, 'agent');
    await flush();

    await tabBadgeManager.markDeliverable([30]);
    await flush();

    // The last badge write for tab 30 should be the deliverable ✓, not ●.
    const calls = chromeMock.action.setBadgeText.mock.calls.filter(
      (c) => (c[0] as { tabId: number }).tabId === 30
    );
    expect(calls.at(-1)![0]).toMatchObject({ tabId: 30, text: '✓' });
  });

  it('drops a deliverable marker when the tab is closed (no leak / no recycled-id inheritance)', async () => {
    await tabBadgeManager.markDeliverable([40]);
    await flush();
    expect(chromeMock.sessionStore.get('tabDeliverableBadges')).toMatchObject({
      tabIds: [40]
    });

    chromeMock.fireRemoved(40);
    await flush();

    expect(chromeMock.sessionStore.get('tabDeliverableBadges')).toMatchObject({
      tabIds: []
    });
  });
});
