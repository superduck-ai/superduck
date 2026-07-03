import { beforeEach, describe, expect, it, vi } from 'vitest';

const chromeMock = vi.hoisted(() => {
  const sessionStore = new Map<string, unknown>();
  const localStore = new Map<string, unknown>();
  const activatedListeners: Array<(activeInfo: { tabId: number }) => void> = [];
  const removedListeners: Array<(tabId: number) => void> = [];
  const replacedListeners: Array<(addedTabId: number, removedTabId: number) => void> = [];
  const updatedListeners: Array<(tabId: number, changeInfo: unknown, tab: unknown) => void> = [];

  const storageArea = (store: Map<string, unknown>) => {
    const area = {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn()
    };
    area.get.mockImplementation(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      return Object.fromEntries(keys.map((item) => [item, store.get(item)]));
    });
    area.set.mockImplementation(async (values: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(values)) store.set(key, value);
    });
    area.remove.mockImplementation(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      for (const item of keys) store.delete(item);
    });
    return area;
  };

  const session = storageArea(sessionStore);
  const local = storageArea(localStore);

  const removeListener = <T>(listeners: T[], listener: T) => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };

  const mock = {
    sessionStore,
    localStore,
    tabs: {
      get: vi.fn(),
      query: vi.fn(),
      onUpdated: {
        addListener: vi.fn(
          (listener: (tabId: number, changeInfo: unknown, tab: unknown) => void) => {
            updatedListeners.push(listener);
          }
        ),
        removeListener: vi.fn(
          (listener: (tabId: number, changeInfo: unknown, tab: unknown) => void) => {
            removeListener(updatedListeners, listener);
          }
        )
      },
      onActivated: {
        addListener: vi.fn((listener: (activeInfo: { tabId: number }) => void) => {
          activatedListeners.push(listener);
        }),
        removeListener: vi.fn((listener: (activeInfo: { tabId: number }) => void) => {
          removeListener(activatedListeners, listener);
        })
      },
      onRemoved: {
        addListener: vi.fn((listener: (tabId: number) => void) => {
          removedListeners.push(listener);
        }),
        removeListener: vi.fn((listener: (tabId: number) => void) => {
          removeListener(removedListeners, listener);
        })
      },
      onReplaced: {
        addListener: vi.fn((listener: (addedTabId: number, removedTabId: number) => void) => {
          replacedListeners.push(listener);
        })
      }
    },
    action: {
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn()
    },
    storage: {
      session,
      local
    },
    fireActivated(tabId: number) {
      for (const listener of [...activatedListeners]) listener({ tabId });
    },
    fireReplaced(addedTabId: number, removedTabId: number) {
      for (const listener of [...replacedListeners]) listener(addedTabId, removedTabId);
    },
    reset() {
      sessionStore.clear();
      localStore.clear();
      activatedListeners.length = 0;
      removedListeners.length = 0;
      replacedListeners.length = 0;
      updatedListeners.length = 0;
      mock.tabs.get.mockReset();
      mock.tabs.get.mockImplementation(async (tabId: number) => ({
        id: tabId,
        groupId: 1,
        index: 0,
        windowId: 1,
        url: 'https://example.com/'
      }));
      mock.tabs.query.mockReset();
      mock.tabs.query.mockResolvedValue([]);
      mock.tabs.onUpdated.addListener.mockClear();
      mock.tabs.onUpdated.removeListener.mockClear();
      mock.tabs.onActivated.addListener.mockClear();
      mock.tabs.onActivated.removeListener.mockClear();
      mock.tabs.onRemoved.addListener.mockClear();
      mock.tabs.onRemoved.removeListener.mockClear();
      mock.tabs.onReplaced.addListener.mockClear();
      mock.action.setBadgeText.mockReset();
      mock.action.setBadgeText.mockResolvedValue(undefined);
      mock.action.setBadgeBackgroundColor.mockReset();
      mock.action.setBadgeBackgroundColor.mockResolvedValue(undefined);
      session.get.mockClear();
      session.set.mockClear();
      session.remove.mockClear();
      local.get.mockClear();
      local.set.mockClear();
      local.remove.mockClear();
    }
  };

  return mock;
});

vi.stubGlobal('chrome', chromeMock);

let tabBadgeManager: typeof import('./tabBadges').tabBadgeManager;

async function loadTabBadgeManager(): Promise<void> {
  vi.resetModules();
  chromeMock.reset();
  ({ tabBadgeManager } = await import('./tabBadges'));
}

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('tabBadgeManager', () => {
  beforeEach(async () => {
    await loadTabBadgeManager();
  });

  it('deduplicates concurrent initialization work', async () => {
    chromeMock.sessionStore.set('tabDeliverableBadges', { tabIds: [10] });
    chromeMock.tabs.query.mockResolvedValue([{ id: 10 }]);

    await Promise.all([tabBadgeManager.initialize(), tabBadgeManager.initialize()]);

    expect(chromeMock.storage.session.get).toHaveBeenCalledTimes(1);
    expect(chromeMock.tabs.query).toHaveBeenCalledTimes(1);
    expect(chromeMock.tabs.onActivated.addListener).toHaveBeenCalledTimes(1);
  });

  it('serializes deliverable writes and filters invalid tab ids before badge refresh', async () => {
    let releaseFirstSet!: () => void;
    const firstSetStarted = new Promise<void>((resolve) => {
      chromeMock.storage.session.set.mockImplementationOnce(
        async (values: Record<string, unknown>) => {
          resolve();
          await new Promise<void>((release) => {
            releaseFirstSet = release;
          });
          for (const [key, value] of Object.entries(values))
            chromeMock.sessionStore.set(key, value);
        }
      );
    });

    const first = tabBadgeManager.markDeliverable([10, Number.NaN, 11.5]);
    await firstSetStarted;
    const second = tabBadgeManager.markDeliverable([20]);
    await Promise.resolve();
    await Promise.resolve();

    expect(chromeMock.storage.session.set).toHaveBeenCalledTimes(1);

    releaseFirstSet();
    await Promise.all([first, second]);

    expect(chromeMock.sessionStore.get('tabDeliverableBadges')).toEqual({ tabIds: [10, 20] });
    const refreshedTabIds = chromeMock.action.setBadgeText.mock.calls.map(
      (call) => (call[0] as { tabId: number }).tabId
    );
    expect(refreshedTabIds.sort((a, b) => a - b)).toEqual([10, 20]);
  });

  it('hydrates stored deliverables before persisting new ones', async () => {
    chromeMock.sessionStore.set('tabDeliverableBadges', { tabIds: [5] });
    chromeMock.tabs.query.mockResolvedValue([{ id: 5 }]);

    await tabBadgeManager.markDeliverable([10]);

    expect(chromeMock.sessionStore.get('tabDeliverableBadges')).toEqual({ tabIds: [5, 10] });
  });

  it('moves deliverable badge state to the new tab id when Chrome replaces a tab', async () => {
    await tabBadgeManager.initialize();
    await tabBadgeManager.markDeliverable([10]);
    chromeMock.action.setBadgeText.mockClear();

    chromeMock.fireReplaced(20, 10);
    await flushAsyncWork();

    expect(chromeMock.sessionStore.get('tabDeliverableBadges')).toEqual({ tabIds: [20] });
    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 20 })
    );
  });
});
