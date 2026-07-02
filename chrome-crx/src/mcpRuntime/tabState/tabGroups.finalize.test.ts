import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockTab = {
  id: number;
  windowId: number;
  groupId: number;
  url: string;
  title: string;
  index: number;
};

const chromeMock = vi.hoisted(() => {
  const tabsById = new Map<number, MockTab>();

  return {
    tabsById,
    tabs: {
      group: vi.fn(async () => 100),
      ungroup: vi.fn(async (tabIds: number | number[]) => {
        const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
        for (const id of ids) {
          const tab = tabsById.get(id);
          if (tab) tab.groupId = -1;
        }
      }),
      remove: vi.fn(async (tabIds: number | number[]) => {
        const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
        for (const id of ids) tabsById.delete(id);
      }),
      get: vi.fn(async (id: number) => {
        const tab = tabsById.get(id);
        if (!tab) throw new Error(`No tab ${id}`);
        return tab;
      }),
      query: vi.fn(async (queryInfo?: { groupId?: number }): Promise<MockTab[]> => {
        const tabs = Array.from(tabsById.values());
        if (typeof queryInfo?.groupId === 'number') {
          return tabs.filter((tab) => tab.groupId === queryInfo.groupId);
        }
        return tabs;
      }),
      sendMessage: vi.fn(async () => {}),
      onRemoved: { addListener: vi.fn() }
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      Color: { ORANGE: 'orange', GREEN: 'green' },
      update: vi.fn(async () => {}),
      query: vi.fn(async (): Promise<Array<{ id: number; title?: string; color?: string }>> => []),
      get: vi.fn(async (id: number) => ({ id, title: '', color: 'orange' }))
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
  };
});

vi.stubGlobal('chrome', chromeMock);

const { tabGroupManager } = await import('./tabGroups');

type AnyMgr = {
  initialized: boolean;
  mcpTabGroupId: number | null;
  groupMetadata: Map<
    number,
    {
      mainTabId: number;
      createdAt: number;
      domain: string;
      chromeGroupId: number;
      memberStates: Map<
        number,
        {
          indicatorState: string;
          origin?: 'agent' | 'user';
          disposition?: 'active' | 'handoff';
          isMcp?: boolean;
        }
      >;
      hasLegacyMemberOrigins?: boolean;
    }
  >;
  groupBlocklistStatuses: Map<number, unknown>;
};

const manager = tabGroupManager as unknown as AnyMgr;

function seedTabs(tabIds: number[]): void {
  chromeMock.tabsById.clear();
  for (const [index, id] of tabIds.entries()) {
    chromeMock.tabsById.set(id, {
      id,
      windowId: 1,
      groupId: 100,
      url: `https://example.com/${id}`,
      title: `Tab ${id}`,
      index
    });
  }
}

function seedGroup(mainTabId: number, members: Array<[number, 'agent' | 'user']>): void {
  manager.groupMetadata.set(mainTabId, {
    mainTabId,
    createdAt: 1,
    domain: 'example.com',
    chromeGroupId: 100,
    memberStates: new Map(
      members.map(([tabId, origin]) => [
        tabId,
        {
          indicatorState: tabId === mainTabId ? 'pulsing' : 'static',
          origin,
          disposition: 'active'
        }
      ])
    )
  });
}

describe('tabGroupManager.finalizeManagedGroup', () => {
  beforeEach(() => {
    manager.initialized = true;
    manager.mcpTabGroupId = null;
    manager.groupMetadata.clear();
    manager.groupBlocklistStatuses.clear();
    chromeMock.tabsById.clear();
    chromeMock.tabs.remove.mockClear();
    chromeMock.tabs.ungroup.mockClear();
    chromeMock.tabs.sendMessage.mockClear();
    chromeMock.tabGroups.query.mockClear();
    chromeMock.storage.local.get.mockClear();
    chromeMock.storage.local.set.mockClear();
    chromeMock.storage.local.remove.mockClear();
  });

  it('keeps handoff tabs in the managed group, ungroups deliverables, and leaves omitted tabs open', async () => {
    seedTabs([1, 2, 3, 4]);
    seedGroup(1, [
      [1, 'user'],
      [2, 'agent'],
      [3, 'user'],
      [4, 'agent']
    ]);

    const context = await tabGroupManager.finalizeManagedGroup({
      mainTabId: 1,
      keep: [
        { tabId: 1, status: 'deliverable' },
        { tabId: 4, status: 'handoff' }
      ]
    });

    // Omitted tabs are ungrouped and left open, never closed.
    expect(chromeMock.tabs.remove).not.toHaveBeenCalled();
    expect(chromeMock.tabs.ungroup).toHaveBeenCalledWith([1, 2, 3]);
    expect(chromeMock.tabsById.has(2)).toBe(true);
    expect(chromeMock.tabsById.get(1)?.groupId).toBe(-1);
    expect(chromeMock.tabsById.get(2)?.groupId).toBe(-1);
    expect(chromeMock.tabsById.get(3)?.groupId).toBe(-1);
    expect(chromeMock.tabsById.get(4)?.groupId).toBe(100);

    expect(manager.groupMetadata.has(1)).toBe(false);
    const handoffMeta = manager.groupMetadata.get(4);
    expect(handoffMeta?.mainTabId).toBe(4);
    expect(Array.from(handoffMeta?.memberStates.keys() ?? [])).toEqual([4]);
    expect(handoffMeta?.memberStates.get(4)).toMatchObject({
      origin: 'agent',
      disposition: 'handoff',
      indicatorState: 'none'
    });
    expect(context).toMatchObject({
      currentTabId: 4,
      tabCount: 1,
      tabGroupId: 100
    });

    // Regression: explicit finalize is the ONLY path that turns a managed
    // group GREEN + ✅. A retained handoff group must be marked complete;
    // idle tool-context cleanup must never reach this (idle ≠ done).
    const updates = chromeMock.tabGroups.update.mock.calls as unknown as Array<
      [unknown, { title?: string; color?: string }]
    >;
    expect(updates.some(([, patch]) => patch?.color === 'green')).toBe(true);
    expect(updates.some(([, patch]) => patch?.title?.startsWith('✅'))).toBe(true);
  });

  it('clears the MCP group id when all SuperDuck-created tabs are omitted and ungrouped', async () => {
    seedTabs([1, 2]);
    seedGroup(1, [
      [1, 'agent'],
      [2, 'agent']
    ]);
    manager.mcpTabGroupId = 100;
    chromeMock.storage.local.get.mockResolvedValueOnce({
      mcpTabGroupId: 100,
      mcpTabGroupOwner: 100
    });

    const context = await tabGroupManager.finalizeMcpTabGroup();

    expect(context).toBeUndefined();
    expect(chromeMock.tabs.remove).not.toHaveBeenCalled();
    expect(chromeMock.tabs.ungroup).toHaveBeenCalledWith([1, 2]);
    expect(chromeMock.tabsById.has(1)).toBe(true);
    expect(chromeMock.tabsById.has(2)).toBe(true);
    expect(manager.groupMetadata.has(1)).toBe(false);
    expect(manager.mcpTabGroupId).toBeNull();
    expect(chromeMock.storage.local.remove).toHaveBeenCalledWith('mcpTabGroupId');
  });

  it('preserves agent origin across indicator state updates before finalizing', async () => {
    seedTabs([1]);
    seedGroup(1, [[1, 'agent']]);
    manager.mcpTabGroupId = 100;
    chromeMock.storage.local.get.mockResolvedValueOnce({
      mcpTabGroupId: 100,
      mcpTabGroupOwner: 100
    });

    await tabGroupManager.setTabIndicatorState(1, 'pulsing', true, false);
    const context = await tabGroupManager.finalizeMcpTabGroup();

    expect(context).toBeUndefined();
    expect(chromeMock.tabs.remove).not.toHaveBeenCalled();
    expect(chromeMock.tabs.ungroup).toHaveBeenCalledWith([1]);
  });

  it('does not finalize a styled sidepanel group when no MCP group pointer is stored', async () => {
    seedTabs([1]);
    seedGroup(1, [[1, 'agent']]);
    chromeMock.storage.local.get.mockResolvedValueOnce({});

    const context = await tabGroupManager.finalizeMcpTabGroup();

    expect(context).toBeUndefined();
    expect(chromeMock.tabGroups.query).not.toHaveBeenCalled();
    expect(chromeMock.tabs.remove).not.toHaveBeenCalled();
    expect(chromeMock.tabs.ungroup).not.toHaveBeenCalled();
    expect(manager.groupMetadata.has(1)).toBe(true);
    expect(chromeMock.tabsById.has(1)).toBe(true);
  });

  it('does not finalize an unowned stored pointer to a styled scheduled group', async () => {
    seedTabs([1]);
    seedGroup(1, [[1, 'agent']]);
    chromeMock.storage.local.get.mockResolvedValueOnce({ mcpTabGroupId: 100 });

    const context = await tabGroupManager.finalizeMcpTabGroup();

    expect(context).toBeUndefined();
    expect(chromeMock.tabs.remove).not.toHaveBeenCalled();
    expect(chromeMock.tabs.ungroup).not.toHaveBeenCalled();
    expect(manager.groupMetadata.has(1)).toBe(true);
    expect(chromeMock.tabsById.has(1)).toBe(true);
    expect(chromeMock.storage.local.remove).toHaveBeenCalledWith('mcpTabGroupId');
  });

  it('migrates legacy stored MCP members without origin to agent-owned before finalizing', async () => {
    seedTabs([1, 2]);
    manager.groupMetadata.set(1, {
      mainTabId: 1,
      createdAt: 1,
      domain: 'example.com',
      chromeGroupId: 100,
      hasLegacyMemberOrigins: true,
      memberStates: new Map([
        [1, { indicatorState: 'none' }],
        [2, { indicatorState: 'static' }]
      ])
    });
    chromeMock.storage.local.get.mockResolvedValueOnce({ mcpTabGroupId: 100 });

    const context = await tabGroupManager.finalizeMcpTabGroup();

    expect(context).toBeUndefined();
    expect(chromeMock.tabs.remove).not.toHaveBeenCalled();
    expect(chromeMock.tabs.ungroup).toHaveBeenCalledWith([1, 2]);
    expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
      mcpTabGroupId: 100,
      mcpTabGroupOwner: 100
    });
    expect(manager.groupMetadata.has(1)).toBe(false);
  });

  it('does not persist or finalize a styled group discovered through MCP context', async () => {
    seedTabs([1]);
    seedGroup(1, [[1, 'agent']]);
    chromeMock.tabGroups.query.mockResolvedValueOnce([
      { id: 100, title: '🦆SuperDuck', color: 'orange' }
    ]);

    const context = await tabGroupManager.getOrCreateMcpTabContext();
    const tabInfo = await tabGroupManager.getTabForMcp(1);
    const finalized = await tabGroupManager.finalizeMcpTabGroup();

    expect(context).toMatchObject({ tabGroupId: 100, tabCount: 1 });
    expect(tabInfo).toMatchObject({ tabId: 1, domain: 'example.com' });
    expect(chromeMock.storage.local.set).not.toHaveBeenCalledWith({ mcpTabGroupId: 100 });
    expect(finalized).toBeUndefined();
    expect(chromeMock.tabs.remove).not.toHaveBeenCalled();
    expect(chromeMock.tabs.ungroup).not.toHaveBeenCalled();
    expect(manager.groupMetadata.has(1)).toBe(true);
    expect(chromeMock.tabsById.has(1)).toBe(true);
  });

  it('rekeys handoff metadata before ungrouping an omitted main tab', async () => {
    seedTabs([1, 2]);
    seedGroup(1, [
      [1, 'agent'],
      [2, 'agent']
    ]);
    // keepOnlyHandoffTabs rekeys mainTabId 1 -> 2 before the omitted main tab
    // is ungrouped, so the handoff metadata is consistent at ungroup time.
    chromeMock.tabs.ungroup.mockImplementationOnce(async (tabIds: number | number[]) => {
      expect(manager.groupMetadata.has(1)).toBe(false);
      expect(manager.groupMetadata.get(2)?.mainTabId).toBe(2);
      const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
      for (const id of ids) {
        const tab = chromeMock.tabsById.get(id);
        if (tab) tab.groupId = -1;
      }
    });

    const context = await tabGroupManager.finalizeManagedGroup({
      mainTabId: 1,
      keep: [{ tabId: 2, status: 'handoff' }]
    });

    expect(chromeMock.tabs.remove).not.toHaveBeenCalled();
    expect(chromeMock.tabs.ungroup).toHaveBeenCalledWith([1]);
    expect(chromeMock.tabsById.has(1)).toBe(true);
    expect(chromeMock.tabsById.get(1)?.groupId).toBe(-1);
    expect(context).toMatchObject({
      currentTabId: 2,
      tabCount: 1,
      tabGroupId: 100
    });
  });

  it('restores handoff metadata and surfaces errors when ungroup fails', async () => {
    seedTabs([1, 2]);
    seedGroup(1, [
      [1, 'user'],
      [2, 'agent']
    ]);
    chromeMock.tabs.ungroup.mockRejectedValueOnce(new Error('ungroup failed'));

    await expect(
      tabGroupManager.finalizeManagedGroup({
        mainTabId: 1,
        keep: [
          { tabId: 1, status: 'deliverable' },
          { tabId: 2, status: 'handoff' }
        ]
      })
    ).rejects.toThrow('ungroup failed');

    expect(chromeMock.tabs.remove).not.toHaveBeenCalled();
    expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
      tabGroups: expect.objectContaining({ 1: expect.any(Object) })
    });
    expect(manager.groupMetadata.has(2)).toBe(false);
    const restoredMeta = manager.groupMetadata.get(1);
    expect(restoredMeta?.mainTabId).toBe(1);
    expect(Array.from(restoredMeta?.memberStates.keys() ?? [])).toEqual([1, 2]);
    expect(restoredMeta?.memberStates.get(1)).toMatchObject({
      origin: 'user',
      disposition: 'active',
      indicatorState: 'pulsing'
    });
    expect(restoredMeta?.memberStates.get(2)).toMatchObject({
      origin: 'agent',
      disposition: 'active',
      indicatorState: 'static'
    });
  });

  it('restores handoff metadata and surfaces errors when ungroup fails (all agent tabs)', async () => {
    seedTabs([1, 2]);
    seedGroup(1, [
      [1, 'agent'],
      [2, 'agent']
    ]);
    chromeMock.tabs.ungroup.mockRejectedValueOnce(new Error('ungroup failed'));

    await expect(
      tabGroupManager.finalizeManagedGroup({
        mainTabId: 1,
        keep: [{ tabId: 2, status: 'handoff' }]
      })
    ).rejects.toThrow('ungroup failed');

    // tab 1 omitted -> ungroup [1]; fails -> handoff metadata restored to snapshot.
    expect(chromeMock.tabs.remove).not.toHaveBeenCalled();
    expect(chromeMock.tabs.ungroup).toHaveBeenCalledWith([1]);
    expect(manager.groupMetadata.has(2)).toBe(false);
    const restoredMeta = manager.groupMetadata.get(1);
    expect(restoredMeta?.mainTabId).toBe(1);
    expect(Array.from(restoredMeta?.memberStates.keys() ?? [])).toEqual([1, 2]);
    expect(restoredMeta?.memberStates.get(1)).toMatchObject({
      origin: 'agent',
      disposition: 'active',
      indicatorState: 'pulsing'
    });
    expect(restoredMeta?.memberStates.get(2)).toMatchObject({
      origin: 'agent',
      disposition: 'active',
      indicatorState: 'static'
    });
  });

  it('leaves omitted tabs open and restores metadata when ungroup fails', async () => {
    seedTabs([1, 2, 3]);
    seedGroup(1, [
      [1, 'agent'],
      [2, 'user'],
      [3, 'agent']
    ]);
    chromeMock.tabs.ungroup.mockRejectedValueOnce(new Error('ungroup failed'));

    await expect(
      tabGroupManager.finalizeManagedGroup({
        mainTabId: 1,
        keep: [
          { tabId: 2, status: 'deliverable' },
          { tabId: 3, status: 'handoff' }
        ]
      })
    ).rejects.toThrow('ungroup failed');

    // Omitted tab 1 is never closed; ungroup failed so tabs stay put.
    expect(chromeMock.tabs.remove).not.toHaveBeenCalled();
    expect(chromeMock.tabsById.has(1)).toBe(true);
    expect(chromeMock.tabs.ungroup).toHaveBeenCalledWith([2, 1]);
  });

  it('rejects keep entries for tabs outside the managed group', async () => {
    seedTabs([1]);
    seedGroup(1, [[1, 'agent']]);

    await expect(
      tabGroupManager.finalizeManagedGroup({
        mainTabId: 1,
        keep: [{ tabId: 99, status: 'handoff' }]
      })
    ).rejects.toThrow(/unknown tab 99/);
  });
});
