import { describe, expect, it, vi } from 'vitest';
import type { TabLease } from './tabLeases';

const chromeMock = vi.hoisted(() => ({
  tabs: {
    get: vi.fn(),
    onRemoved: {
      addListener: vi.fn()
    },
    onReplaced: {
      addListener: vi.fn()
    }
  },
  tabGroups: {
    TAB_GROUP_ID_NONE: -1
  },
  storage: {
    session: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => ({})),
      remove: vi.fn(async () => ({}))
    },
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => ({})),
      remove: vi.fn(async () => ({}))
    }
  }
}));

vi.stubGlobal('chrome', chromeMock);

const { buildSessionContextFromLeases } = await import('./sessionLeaseContext');

function deferredTab(tab: chrome.tabs.Tab): {
  promise: Promise<chrome.tabs.Tab>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<chrome.tabs.Tab>((done) => {
    resolve = () => done(tab);
  });
  return { promise, resolve };
}

function makeTab(
  tab: Pick<chrome.tabs.Tab, 'id' | 'groupId' | 'index' | 'windowId'>
): chrome.tabs.Tab {
  return {
    active: false,
    audible: false,
    autoDiscardable: true,
    discarded: false,
    favIconUrl: '',
    frozen: false,
    groupId: tab.groupId,
    height: 800,
    highlighted: false,
    id: tab.id,
    incognito: false,
    index: tab.index,
    mutedInfo: { muted: false },
    pinned: false,
    selected: false,
    status: 'complete',
    title: '',
    url: 'https://example.com/',
    width: 1200,
    windowId: tab.windowId
  };
}

describe('buildSessionContextFromLeases', () => {
  it('starts tab lookups in parallel before awaiting individual results', async () => {
    const first = deferredTab(makeTab({ id: 10, groupId: 100, index: 0, windowId: 1 }));
    const second = deferredTab(makeTab({ id: 11, groupId: 100, index: 1, windowId: 1 }));
    chromeMock.tabs.get.mockImplementation((tabId: number) => {
      if (tabId === 10) return first.promise;
      if (tabId === 11) return second.promise;
      return Promise.reject(new Error('missing tab'));
    });
    const leases: TabLease[] = [
      {
        tabId: 10,
        sessionId: 'session-a',
        origin: 'agent',
        claimedAt: 1,
        state: 'active',
        groupId: 100
      },
      {
        tabId: 11,
        sessionId: 'session-a',
        origin: 'agent',
        claimedAt: 2,
        state: 'active',
        groupId: 100
      }
    ];

    const contextPromise = buildSessionContextFromLeases(leases);
    await Promise.resolve();

    expect(chromeMock.tabs.get).toHaveBeenCalledTimes(2);
    second.resolve();
    first.resolve();
    await expect(contextPromise).resolves.toMatchObject({
      currentTabId: 10,
      tabCount: 2,
      tabGroupId: 100
    });
  });
});
