import { beforeEach, describe, expect, it, vi } from 'vitest';

const chromeMock = vi.hoisted(() => {
  const sessionStore = new Map<string, unknown>();
  const localStore = new Map<string, unknown>();
  let removedListener: ((tabId: number) => void) | undefined;
  let replacedListener: ((addedTabId: number, removedTabId: number) => void) | undefined;

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
      query: vi.fn(async (): Promise<chrome.tabs.Tab[]> => []),
      onRemoved: {
        addListener: vi.fn((listener: (tabId: number) => void) => {
          removedListener = listener;
        })
      },
      onReplaced: {
        addListener: vi.fn((listener: (addedTabId: number, removedTabId: number) => void) => {
          replacedListener = listener;
        })
      }
    },
    storage: {
      session: storageArea(sessionStore),
      local: storageArea(localStore)
    },
    fireRemoved(tabId: number) {
      removedListener?.(tabId);
    },
    fireReplaced(addedTabId: number, removedTabId: number) {
      replacedListener?.(addedTabId, removedTabId);
    }
  };
});

vi.stubGlobal('chrome', chromeMock);

const { tabLeaseManager } = await import('./tabLeases');

type MutableLeaseManager = typeof tabLeaseManager & {
  initialized: boolean;
  leases: Map<number, unknown>;
};

const manager = tabLeaseManager as MutableLeaseManager;

async function resetLeases(): Promise<void> {
  chromeMock.sessionStore.clear();
  manager.leases.clear();
  manager.initialized = false;
}

describe('tabLeaseManager', () => {
  beforeEach(async () => {
    await resetLeases();
    chromeMock.tabs.get.mockClear();
    chromeMock.tabs.query.mockClear();
    chromeMock.storage.session.get.mockClear();
    chromeMock.storage.session.set.mockClear();
    chromeMock.storage.session.remove.mockClear();
  });

  it('stores active leases by tabId and refreshes them for the same session', async () => {
    await tabLeaseManager.claimTab('session-a', 10, 'agent', { groupId: 100 });
    await tabLeaseManager.claimTab('session-a', 10, 'user', { groupId: 100 });

    const lease = await tabLeaseManager.getLease(10);
    expect(lease).toMatchObject({
      tabId: 10,
      sessionId: 'session-a',
      origin: 'agent',
      state: 'active',
      groupId: 100
    });
    expect(chromeMock.sessionStore.get('tabLeases')).toMatchObject({
      leases: {
        '10': {
          tabId: 10,
          sessionId: 'session-a',
          origin: 'agent',
          state: 'active'
        }
      }
    });
  });

  it('rejects active tabs owned by another session', async () => {
    await tabLeaseManager.claimTab('session-a', 10, 'agent');

    await expect(tabLeaseManager.claimTab('session-b', 10, 'agent')).rejects.toThrow(
      'Tab 10 is already part of browser session session-a'
    );
    await expect(tabLeaseManager.assertTabAvailableForSession('session-b', 10)).rejects.toThrow(
      'Tab 10 is already part of browser session session-a'
    );
  });

  it('rejects handoff tabs owned by another session', async () => {
    await tabLeaseManager.claimTab('session-a', 10, 'agent');
    await tabLeaseManager.handoffTabs('session-a', [10]);

    await expect(tabLeaseManager.claimTab('session-b', 10, 'agent')).rejects.toThrow(
      'Tab 10 is already part of browser session session-a'
    );
    await expect(tabLeaseManager.assertTabAvailableForSession('session-b', 10)).rejects.toThrow(
      'Tab 10 is already part of browser session session-a'
    );
    expect(await tabLeaseManager.getLease(10)).toMatchObject({
      sessionId: 'session-a',
      state: 'handoff'
    });
  });

  it('moves handoff leases back to active without changing origin or claimedAt', async () => {
    const initial = await tabLeaseManager.claimTab('session-a', 10, 'agent', {
      groupId: 100
    });
    await tabLeaseManager.handoffTabs('session-a', [10], {
      groupId: 100
    });

    expect(await tabLeaseManager.getLease(10)).toMatchObject({ state: 'handoff' });
    const resumed = await tabLeaseManager.resumeHandoffTabs('session-a');

    expect(resumed).toHaveLength(1);
    expect(resumed[0]).toMatchObject({
      tabId: 10,
      sessionId: 'session-a',
      origin: 'agent',
      state: 'active',
      groupId: 100
    });
    expect(resumed[0].claimedAt).toBe(initial.claimedAt);
  });

  it('claimTab resumes a same-session handoff lease', async () => {
    const initial = await tabLeaseManager.claimTab('session-a', 10, 'agent');
    await tabLeaseManager.handoffTabs('session-a', [10]);

    const resumed = await tabLeaseManager.claimTab('session-a', 10, 'agent');

    expect(resumed).toMatchObject({
      tabId: 10,
      sessionId: 'session-a',
      state: 'active'
    });
    expect(resumed.claimedAt).toBe(initial.claimedAt);
  });

  it('removes and replaces leases from tab lifecycle events', async () => {
    await tabLeaseManager.claimTab('session-a', 10, 'agent');
    chromeMock.fireReplaced(20, 10);
    await Promise.resolve();

    expect(await tabLeaseManager.getLease(10)).toBeUndefined();
    expect(await tabLeaseManager.getLease(20)).toMatchObject({ tabId: 20 });

    chromeMock.fireRemoved(20);
    await Promise.resolve();
    expect(await tabLeaseManager.getLease(20)).toBeUndefined();
  });

  it('marks only the activeTabId handoff lease as the primary continuation point', async () => {
    await tabLeaseManager.claimTab('session-a', 10, 'agent');
    await tabLeaseManager.claimTab('session-a', 11, 'agent');

    await tabLeaseManager.handoffTabs('session-a', [10, 11], {
      activeTabId: 11
    });

    expect(await tabLeaseManager.getLease(10)).toMatchObject({
      state: 'handoff',
      isActiveHandoff: false
    });
    expect(await tabLeaseManager.getLease(11)).toMatchObject({
      state: 'handoff',
      isActiveHandoff: true
    });
  });

  it('clears a stale isActiveHandoff marker when re-handing off without activeTabId', async () => {
    await tabLeaseManager.claimTab('session-a', 10, 'agent');
    await tabLeaseManager.handoffTabs('session-a', [10], { activeTabId: 10 });
    expect((await tabLeaseManager.getLease(10))?.isActiveHandoff).toBe(true);

    await tabLeaseManager.handoffTabs('session-a', [10]);
    expect((await tabLeaseManager.getLease(10))?.isActiveHandoff).toBe(false);
  });

  it('promotes the primary handoff tab to the front of resumeHandoffTabs and keeps the marker', async () => {
    await tabLeaseManager.claimTab('session-a', 10, 'agent');
    await tabLeaseManager.claimTab('session-a', 11, 'agent');
    await tabLeaseManager.handoffTabs('session-a', [10, 11], {
      activeTabId: 11
    });

    const resumed = await tabLeaseManager.resumeHandoffTabs('session-a');

    expect(resumed).toHaveLength(2);
    expect(resumed[0]).toMatchObject({ tabId: 11, isActiveHandoff: true, state: 'active' });
    expect(resumed[1]).toMatchObject({ tabId: 10, isActiveHandoff: false, state: 'active' });
    // Marker survives resume so buildSessionContextFromLeases can pick currentTabId.
    expect((await tabLeaseManager.getLease(11))?.isActiveHandoff).toBe(true);
  });

  it('clears stale primary markers outside a partial handoff set', async () => {
    await tabLeaseManager.claimTab('session-a', 10, 'agent');
    await tabLeaseManager.claimTab('session-a', 11, 'agent');
    await tabLeaseManager.handoffTabs('session-a', [10, 11], {
      activeTabId: 11
    });
    await tabLeaseManager.resumeHandoffTabs('session-a');

    await tabLeaseManager.handoffTabs('session-a', [10], { activeTabId: 10 });

    expect(await tabLeaseManager.getLease(10)).toMatchObject({
      state: 'handoff',
      isActiveHandoff: true
    });
    expect(await tabLeaseManager.getLease(11)).toMatchObject({
      state: 'active',
      isActiveHandoff: false
    });
  });

  it('clears isActiveHandoff when re-claiming an existing lease', async () => {
    await tabLeaseManager.claimTab('session-a', 10, 'agent');
    await tabLeaseManager.handoffTabs('session-a', [10], { activeTabId: 10 });
    expect((await tabLeaseManager.getLease(10))?.isActiveHandoff).toBe(true);

    await tabLeaseManager.claimTab('session-a', 10, 'agent');
    expect((await tabLeaseManager.getLease(10))?.isActiveHandoff).toBe(false);
  });

  it('notifies lease change listeners after mutations', async () => {
    const events: { tabIds: number[]; sessionId: string }[] = [];
    const unsubscribe = tabLeaseManager.addLeaseChangeListener((tabIds, sessionId) => {
      events.push({ tabIds, sessionId });
    });

    await tabLeaseManager.claimTab('session-a', 10, 'agent');
    await tabLeaseManager.handoffTabs('session-a', [10], { activeTabId: 10 });
    await tabLeaseManager.releaseTabs('session-a', [10]);

    unsubscribe();
    await tabLeaseManager.claimTab('session-a', 11, 'agent');

    expect(events).toEqual([
      { tabIds: [10], sessionId: 'session-a' },
      { tabIds: [10], sessionId: 'session-a' },
      { tabIds: [10], sessionId: 'session-a' }
    ]);
  });

  it('bulk-prunes missing tabs and notifies lifecycle listeners', async () => {
    await tabLeaseManager.claimTab('session-a', 10, 'agent');
    await tabLeaseManager.claimTab('session-b', 11, 'agent');
    const events: { tabIds: number[]; sessionId: string }[] = [];
    const unsubscribe = tabLeaseManager.addLeaseChangeListener((tabIds, sessionId) => {
      events.push({ tabIds, sessionId });
    });
    chromeMock.tabs.query.mockResolvedValue([
      {
        active: false,
        autoDiscardable: true,
        discarded: false,
        frozen: false,
        groupId: 1,
        highlighted: false,
        id: 10,
        incognito: false,
        index: 0,
        pinned: false,
        selected: false,
        windowId: 1,
        url: 'https://example.com/'
      }
    ]);
    chromeMock.tabs.get.mockClear();

    await tabLeaseManager.pruneMissingTabs();

    unsubscribe();
    expect(chromeMock.tabs.query).toHaveBeenCalledTimes(1);
    expect(chromeMock.tabs.get).not.toHaveBeenCalled();
    expect(await tabLeaseManager.getLease(10)).toMatchObject({ tabId: 10 });
    expect(await tabLeaseManager.getLease(11)).toBeUndefined();
    expect(events).toEqual([{ tabIds: [11], sessionId: '' }]);
  });
});
