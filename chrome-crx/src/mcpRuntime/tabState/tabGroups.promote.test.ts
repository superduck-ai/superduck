// Cover TabGroupManager.promoteToMainTab — the path PANEL_READY relies on
// when the user opens the sidepanel from a secondary tab inside an
// existing SuperDuck group. The contract being verified:
//
//   * Group ownership moves from oldMainTabId → newMainTabId (the metadata
//     map is re-keyed).
//   * The new main is tracked in `memberStates` with `indicatorState:
//     'none'` (main tabs are members of the group's member-state map too —
//     see createGroup / adoptOrphanedGroup for the seed path), and any
//     indicator the new tab previously had as a secondary is cleared.
//   * The old main stays in the group as a secondary tab with no
//     indicators.
//   * If the old main was in `pulsing` state (agent actively running
//     there), the pulsing indicator is moved to the new main — the agent
//     follows the user's focus, not the other way around.
//   * Misuse throws: promoting a tab that isn't in the group, or
//     promoting away from a tab that isn't a tracked main.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type MockTab = {
  id: number;
  windowId: number;
  groupId: number;
  url: string;
  title: string;
  index: number;
};

const chromeMock = vi.hoisted(() => ({
  tabs: {
    group: vi.fn(async (_opts: unknown) => 9999),
    ungroup: vi.fn(async () => {}),
    get: vi.fn(async (id: number) => ({
      id,
      windowId: 1,
      groupId: 100,
      url: 'https://example.com',
      index: 0
    })),
    query: vi.fn(async (_queryInfo?: unknown): Promise<MockTab[]> => []),
    sendMessage: vi.fn(async (_tabId: number, _message?: unknown) => {}),
    onRemoved: { addListener: vi.fn() }
  },
  tabGroups: {
    TAB_GROUP_ID_NONE: -1,
    Color: { ORANGE: 'orange' },
    update: vi.fn(async () => {}),
    query: vi.fn(async () => []),
    get: vi.fn(async () => ({ id: 100, title: '' }))
  },
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
      remove: vi.fn(async () => {})
    }
  },
  windows: { get: vi.fn(async () => ({})) },
  runtime: { getManifest: vi.fn(() => ({ version: '0.0.0-test' })) }
}));

vi.stubGlobal('chrome', chromeMock);

const { tabGroupManager } = await import('./tabGroups');

type AnyMgr = {
  groupMetadata: Map<
    number,
    {
      mainTabId: number;
      chromeGroupId: number;
      memberStates: Map<
        number,
        {
          indicatorState: 'pulsing' | 'static' | 'none';
          previousIndicatorState?: 'pulsing' | 'static' | 'none';
          pendingUpdate?: string;
        }
      >;
    }
  >;
  indicatorUpdateTimer: ReturnType<typeof setTimeout> | null;
};

const m = tabGroupManager as unknown as AnyMgr;

function setUpGroup(
  mainTabId: number,
  memberTabIds: number[],
  mainState: 'pulsing' | 'static' | 'none',
  memberState: 'pulsing' | 'static' | 'none' = 'static'
) {
  const memberStates = new Map<number, { indicatorState: typeof mainState }>();
  memberStates.set(mainTabId, { indicatorState: mainState });
  for (const id of memberTabIds) {
    if (id === mainTabId) continue;
    memberStates.set(id, { indicatorState: memberState });
  }
  m.groupMetadata.set(mainTabId, {
    mainTabId,
    chromeGroupId: 100,
    memberStates
  });
}

function setChromeGroupTabs(tabIds: number[]): void {
  chromeMock.tabs.query.mockImplementation(async (queryInfo?: unknown) => {
    const groupId =
      typeof queryInfo === 'object' && queryInfo !== null && 'groupId' in queryInfo
        ? (queryInfo as { groupId?: unknown }).groupId
        : undefined;
    if (groupId !== 100) return [];
    return tabIds.map((id, index) => ({
      id,
      windowId: 1,
      groupId: 100,
      url: `https://example.com/${id}`,
      title: `Tab ${id}`,
      index
    }));
  });
}

beforeEach(() => {
  if (m.indicatorUpdateTimer) {
    clearTimeout(m.indicatorUpdateTimer);
    m.indicatorUpdateTimer = null;
  }
  m.groupMetadata.clear();
  chromeMock.tabs.sendMessage.mockClear();
  chromeMock.tabs.query.mockReset();
  chromeMock.tabs.query.mockResolvedValue([]);
  chromeMock.storage.local.set.mockClear();
});

afterEach(() => {
  if (m.indicatorUpdateTimer) {
    clearTimeout(m.indicatorUpdateTimer);
    m.indicatorUpdateTimer = null;
  }
});

describe('tabGroupManager.clearIndicatorsForGroup', () => {
  it('hides agent and static indicators for every tracked member in the group', async () => {
    setUpGroup(1, [2, 3], 'pulsing', 'static');
    setChromeGroupTabs([1, 2, 3]);

    await tabGroupManager.clearIndicatorsForGroup(1);

    const meta = m.groupMetadata.get(1);
    if (!meta) throw new Error('expected group to stay tracked');
    for (const memberState of meta.memberStates.values()) {
      expect(memberState.indicatorState).toBe('none');
    }

    const sendCalls = chromeMock.tabs.sendMessage.mock.calls;
    for (const tabId of [1, 2, 3]) {
      expect(
        sendCalls.some(
          (call) =>
            call[0] === tabId && (call[1] as { type?: string }).type === 'HIDE_AGENT_INDICATORS'
        )
      ).toBe(true);
      expect(
        sendCalls.some(
          (call) =>
            call[0] === tabId && (call[1] as { type?: string }).type === 'HIDE_STATIC_INDICATOR'
        )
      ).toBe(true);
    }
  });

  it('clears tracked members without re-querying Chrome group membership', async () => {
    setUpGroup(1, [2, 3], 'pulsing', 'static');
    chromeMock.tabs.query.mockImplementation(async () => {
      throw new Error('membership should not be queried during group cleanup');
    });

    await tabGroupManager.clearIndicatorsForGroup(1);

    expect(chromeMock.tabs.query).not.toHaveBeenCalled();
    const meta = m.groupMetadata.get(1);
    if (!meta) throw new Error('expected group to stay tracked');
    expect(meta.memberStates.get(1)?.indicatorState).toBe('none');
    expect(meta.memberStates.get(2)?.indicatorState).toBe('none');
    expect(meta.memberStates.get(3)?.indicatorState).toBe('none');
    expect(meta.memberStates.get(3)?.previousIndicatorState).toBeUndefined();
  });
});

describe('tabGroupManager.promoteToMainTab', () => {
  it('re-keys the metadata map from oldMainTabId → newMainTabId', async () => {
    setUpGroup(1, [2, 3], 'none');

    await tabGroupManager.promoteToMainTab(1, 2);

    expect(m.groupMetadata.has(1)).toBe(false);
    expect(m.groupMetadata.has(2)).toBe(true);
    const meta = m.groupMetadata.get(2);
    if (!meta) throw new Error('expected new main to be tracked');
    expect(meta.mainTabId).toBe(2);
  });

  it('tracks the new main in memberStates with "none" indicator when the old main was not pulsing', async () => {
    setUpGroup(1, [2, 3], 'none', 'static');

    await tabGroupManager.promoteToMainTab(1, 2);

    const meta = m.groupMetadata.get(2);
    if (!meta) throw new Error('expected new main to be tracked');
    // `memberStates` stores main tabs too (createGroup / adoptOrphanedGroup
    // also seed it). After promote, the new main sits there with state
    // 'none' — no agent currently running.
    expect(meta.memberStates.get(2)).toEqual({ indicatorState: 'none' });
    // Other members stay in the group
    expect(meta.memberStates.has(3)).toBe(true);
    // The old main is still tracked as a member
    expect(meta.memberStates.has(1)).toBe(true);
  });

  it('clears any static indicator the new tab had as a secondary', async () => {
    setUpGroup(1, [2], 'none', 'static');

    await tabGroupManager.promoteToMainTab(1, 2);

    const sendCalls = chromeMock.tabs.sendMessage.mock.calls;
    const hideStaticCall = sendCalls.find(
      (call) => call[0] === 2 && (call[1] as { type?: string }).type === 'HIDE_STATIC_INDICATOR'
    );
    expect(hideStaticCall).toBeDefined();
  });

  it('keeps the old main in the group after promote (its indicatorState is preserved as data)', async () => {
    setUpGroup(1, [2], 'none');

    await tabGroupManager.promoteToMainTab(1, 2);

    const meta = m.groupMetadata.get(2);
    if (!meta) throw new Error('expected new main to be tracked');
    // The old main stays in memberStates. Its prior state ('none') is
    // preserved — `promoteToMainTab` does not zero it out, since the
    // state is read elsewhere (e.g. handleTabGroupChange) for diagnostic
    // and recovery decisions.
    expect(meta.memberStates.get(1)?.indicatorState).toBe('none');
  });

  it('moves the pulsing indicator to the new main when the old main was pulsing', async () => {
    setUpGroup(1, [2], 'pulsing', 'static');

    await tabGroupManager.promoteToMainTab(1, 2);

    const meta = m.groupMetadata.get(2);
    if (!meta) throw new Error('expected new main to be tracked');
    // New main is now the pulsing tab
    expect(meta.memberStates.get(2)?.indicatorState).toBe('pulsing');
    // The old main's state is intentionally left as-is in memberStates.
    // The HIDE_AGENT_INDICATORS message already took care of the visual
    // side; the data layer preserves the last-known state for recovery.
    expect(meta.memberStates.get(1)?.indicatorState).toBe('pulsing');

    const sendCalls = chromeMock.tabs.sendMessage.mock.calls;
    const hideOnOld = sendCalls.find(
      (call) => call[0] === 1 && (call[1] as { type?: string }).type === 'HIDE_AGENT_INDICATORS'
    );
    const showOnNew = sendCalls.find(
      (call) => call[0] === 2 && (call[1] as { type?: string }).type === 'SHOW_AGENT_INDICATORS'
    );
    expect(hideOnOld).toBeDefined();
    expect(showOnNew).toBeDefined();
  });

  it('does not show a pulsing indicator on the new main when the old main was not pulsing', async () => {
    setUpGroup(1, [2], 'none', 'static');

    await tabGroupManager.promoteToMainTab(1, 2);

    const sendCalls = chromeMock.tabs.sendMessage.mock.calls;
    const showAgentCall = sendCalls.find(
      (call) => (call[1] as { type?: string }).type === 'SHOW_AGENT_INDICATORS'
    );
    expect(showAgentCall).toBeUndefined();
  });

  it('throws when the new tab is not in the same Chrome group', async () => {
    setUpGroup(1, [2], 'none');
    // Pretend tab 3 isn't in chrome group 100
    chromeMock.tabs.get.mockImplementationOnce(async (id: number) => ({
      id,
      windowId: 1,
      groupId: id === 3 ? -1 : 100,
      url: 'https://example.com',
      index: 0
    }));

    await expect(tabGroupManager.promoteToMainTab(1, 3)).rejects.toThrow(/not in the same group/);
  });

  it('throws when the old main is not tracked', async () => {
    await expect(tabGroupManager.promoteToMainTab(99, 1)).rejects.toThrow(/No group found/);
  });

  it('persists the new state to storage', async () => {
    setUpGroup(1, [2], 'none');

    await tabGroupManager.promoteToMainTab(1, 2);

    expect(chromeMock.storage.local.set).toHaveBeenCalled();
  });
});
