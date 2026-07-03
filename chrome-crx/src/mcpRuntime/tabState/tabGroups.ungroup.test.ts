// Verify that when the main tab of a group is ungrouped, the
// group is NOT silently rebuilt. This is the regression test for the bug
// where clicking "Ungroup" on a group (or moving the main tab out) would
// cause the TabGroupManager to immediately re-create the group.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const chromeMock = vi.hoisted(() => ({
  tabs: {
    group: vi.fn(async (_opts: unknown) => 9999),
    ungroup: vi.fn(async () => {}),
    get: vi.fn(async (id: number) => ({
      id,
      windowId: 1,
      groupId: id === 1 ? 100 : -1,
      url: 'https://example.com',
      index: 0
    })),
    query: vi.fn(async () => []),
    sendMessage: vi.fn(async (_tabId: number, _message?: unknown) => ({ success: true })),
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
    { mainTabId?: number; chromeGroupId: number; memberStates: Map<number, unknown> }
  >;
  groupBlocklistStatuses: Map<number, unknown>;
  mcpTabGroupId: number | null;
};

const manager = tabGroupManager as unknown as AnyMgr;

describe('tabGroupManager.handleTabGroupChange — ungroup regression', () => {
  beforeEach(() => {
    manager.groupMetadata.clear();
    manager.groupBlocklistStatuses.clear();
    manager.mcpTabGroupId = null;
    chromeMock.tabs.group.mockClear();
    chromeMock.tabs.ungroup.mockClear();
    chromeMock.tabs.sendMessage.mockClear();
    chromeMock.tabs.query.mockReset();
    chromeMock.tabs.query.mockResolvedValue([]);
    chromeMock.tabGroups.update.mockClear();
    chromeMock.storage.local.get.mockReset();
    chromeMock.storage.local.get.mockResolvedValue({});
    chromeMock.storage.local.set.mockClear();
    chromeMock.storage.local.remove.mockClear();
  });

  it('does NOT rebuild the group when the main tab is ungrouped (newGroupId === -1)', async () => {
    const m = manager;
    m.groupMetadata.set(1, {
      chromeGroupId: 100,
      memberStates: new Map<number, unknown>([
        [1, { indicatorState: 'pulsing' }],
        [2, { indicatorState: 'static' }]
      ])
    });

    await tabGroupManager.handleTabGroupChange(1, chromeMock.tabGroups.TAB_GROUP_ID_NONE);

    expect(m.groupMetadata.has(1)).toBe(false);
    expect(chromeMock.tabs.group).not.toHaveBeenCalled();
  });

  it('does NOT rebuild when a non-main member tab is moved out', async () => {
    const m = manager;
    m.groupMetadata.set(1, {
      chromeGroupId: 100,
      memberStates: new Map<number, unknown>([
        [1, { indicatorState: 'pulsing' }],
        [2, { indicatorState: 'static' }]
      ])
    });

    await tabGroupManager.handleTabGroupChange(2, chromeMock.tabGroups.TAB_GROUP_ID_NONE);

    expect(m.groupMetadata.has(1)).toBe(true);
    const meta = m.groupMetadata.get(1)!;
    expect(meta.memberStates.has(2)).toBe(false);
    expect(chromeMock.tabs.group).not.toHaveBeenCalled();
  });

  it('simulates the "Ungroup" menu on the group itself: tabs fire onUpdated with -1 in any order', async () => {
    // When the user right-clicks the group label and chooses "Ungroup",
    // Chrome fires onUpdated for *every* tab in the group, each with
    // changeInfo.groupId = -1. The events arrive in undefined order.
    const m = manager;
    m.groupMetadata.set(1, {
      chromeGroupId: 100,
      memberStates: new Map<number, unknown>([
        [1, { indicatorState: 'pulsing' }],
        [2, { indicatorState: 'static' }],
        [3, { indicatorState: 'static' }]
      ])
    });

    // Worst case: main tab fires LAST, after both members have been
    // removed. This is the most likely real-world order on Edge.
    await tabGroupManager.handleTabGroupChange(2, chromeMock.tabGroups.TAB_GROUP_ID_NONE);
    await tabGroupManager.handleTabGroupChange(3, chromeMock.tabGroups.TAB_GROUP_ID_NONE);
    await tabGroupManager.handleTabGroupChange(1, chromeMock.tabGroups.TAB_GROUP_ID_NONE);

    // Group is gone, no rebuild.
    expect(m.groupMetadata.has(1)).toBe(false);
    expect(chromeMock.tabs.group).not.toHaveBeenCalled();
  });

  it('user ungroups then reopens sidepanel: createGroup() is the only thing that brings the group back, not the onUpdated self-healer', async () => {
    // This is the regression for the original bug 2 report: after the user
    // ungroups, our onUpdated handler must NOT silently rebuild. The only
    // way the group comes back is if the user opens the sidepanel again
    // (PANEL_READY -> createGroup).
    const m = manager;
    m.groupMetadata.set(1, {
      chromeGroupId: 100,
      memberStates: new Map<number, unknown>([[1, { indicatorState: 'pulsing' }]])
    });

    // 1. User ungroups. Our handler must tear down and NOT rebuild.
    await tabGroupManager.handleTabGroupChange(1, chromeMock.tabGroups.TAB_GROUP_ID_NONE);
    expect(m.groupMetadata.has(1)).toBe(false);
    expect(chromeMock.tabs.group).not.toHaveBeenCalled();

    // 2. Some other tab events come in (e.g. the user keeps browsing). None
    // of them should cause a rebuild.
    await tabGroupManager.handleTabGroupChange(99, chromeMock.tabGroups.TAB_GROUP_ID_NONE);
    expect(m.groupMetadata.has(1)).toBe(false);
    expect(chromeMock.tabs.group).not.toHaveBeenCalled();

    // 3. createGroup IS allowed to bring it back. This is what PANEL_READY
    // does once the user explicitly reopens the sidepanel. We call it
    // directly here to assert that the path works (the runtime message
    // handler exercises the same code).
    await tabGroupManager.createGroup(1);
    expect(chromeMock.tabs.group).toHaveBeenCalledTimes(1);
    expect(m.groupMetadata.has(1)).toBe(true);
  });

  it('clears the MCP group pointer when the MCP main tab is manually ungrouped', async () => {
    const m = manager;
    m.mcpTabGroupId = 100;
    m.groupBlocklistStatuses.set(100, {});
    m.groupMetadata.set(1, {
      mainTabId: 1,
      chromeGroupId: 100,
      memberStates: new Map<number, unknown>([
        [1, { indicatorState: 'pulsing', origin: 'agent', disposition: 'active' }],
        [2, { indicatorState: 'static', origin: 'agent', disposition: 'active' }]
      ])
    });

    await tabGroupManager.handleTabGroupChange(1, chromeMock.tabGroups.TAB_GROUP_ID_NONE);

    expect(m.groupMetadata.has(1)).toBe(false);
    expect(m.groupBlocklistStatuses.has(100)).toBe(false);
    expect(m.mcpTabGroupId).toBeNull();
    expect(chromeMock.storage.local.remove).toHaveBeenCalledWith('mcpTabGroupId');
  });

  it('updates the stored MCP group pointer when the MCP main tab is regrouped', async () => {
    const m = manager;
    m.mcpTabGroupId = 100;
    m.groupMetadata.set(1, {
      mainTabId: 1,
      chromeGroupId: 100,
      memberStates: new Map<number, unknown>([
        [1, { indicatorState: 'pulsing', origin: 'agent', disposition: 'active' }],
        [2, { indicatorState: 'static', origin: 'agent', disposition: 'active' }]
      ])
    });
    chromeMock.storage.local.get.mockResolvedValue({
      mcpTabGroupId: 100,
      mcpTabGroupOwner: 100
    });

    await tabGroupManager.handleTabGroupChange(1, 200);

    const meta = m.groupMetadata.get(1);
    expect(meta?.chromeGroupId).toBe(9999);
    expect(m.mcpTabGroupId).toBe(9999);
    expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
      mcpTabGroupId: 9999,
      mcpTabGroupOwner: 9999
    });
  });

  it('clears a stored MCP group pointer when deleteGroup removes that group before the pointer is loaded', async () => {
    const m = manager;
    chromeMock.storage.local.get.mockResolvedValueOnce({ mcpTabGroupId: 100 });
    m.groupMetadata.set(1, {
      mainTabId: 1,
      chromeGroupId: 100,
      memberStates: new Map<number, unknown>([[1, { indicatorState: 'none' }]])
    });

    await tabGroupManager.deleteGroup(1);

    expect(m.groupMetadata.has(1)).toBe(false);
    expect(chromeMock.storage.local.remove).toHaveBeenCalledWith('mcpTabGroupId');
  });
});
