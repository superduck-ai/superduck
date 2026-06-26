import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockTab = {
  id: number;
  windowId: number;
  groupId: number;
  url: string;
  title: string;
  index: number;
  active?: boolean;
  openerTabId?: number;
};

const chromeMock = vi.hoisted(() => {
  const tabsById = new Map<number, MockTab>();
  const groupIds = new Set<number>();
  const groupTitles = new Map<number, string>();
  const groupColors = new Map<number, string>();
  const sessionStore = new Map<string, unknown>();
  const localStore = new Map<string, unknown>();
  let nextTabId = 7;
  let nextGroupId = 123;

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
    tabsById,
    groupIds,
    groupTitles,
    groupColors,
    sessionStore,
    localStore,
    reset() {
      tabsById.clear();
      groupIds.clear();
      groupTitles.clear();
      groupColors.clear();
      sessionStore.clear();
      localStore.clear();
      localStore.set('extensionInstanceId', 'instance-test');
      nextTabId = 7;
      nextGroupId = 123;
    },
    tabs: {
      create: vi.fn(async ({ url, active }: { url?: string; active?: boolean }) => {
        const id = nextTabId++;
        const tab: MockTab = {
          id,
          windowId: 1,
          groupId: -1,
          url: url || 'chrome://newtab',
          title: `Tab ${id}`,
          index: tabsById.size,
          active
        };
        tabsById.set(id, tab);
        return tab;
      }),
      group: vi.fn(async ({ tabIds, groupId }: { tabIds: number[]; groupId?: number }) => {
        const id = groupId ?? nextGroupId++;
        groupIds.add(id);
        for (const tabId of tabIds) {
          const tab = tabsById.get(tabId);
          if (tab) tab.groupId = id;
        }
        return id;
      }),
      ungroup: vi.fn(async (tabIds: number | number[]) => {
        const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
        for (const tabId of ids) {
          const tab = tabsById.get(tabId);
          if (tab) tab.groupId = -1;
        }
      }),
      remove: vi.fn(async (tabIds: number | number[]) => {
        const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
        for (const tabId of ids) tabsById.delete(tabId);
      }),
      get: vi.fn(async (tabId: number) => {
        const tab = tabsById.get(tabId);
        if (!tab) throw new Error(`No tab ${tabId}`);
        return tab;
      }),
      query: vi.fn(async (queryInfo?: { groupId?: number }): Promise<MockTab[]> => {
        const tabs = Array.from(tabsById.values());
        if (typeof queryInfo?.groupId === 'number') {
          return tabs.filter((tab) => tab.groupId === queryInfo.groupId);
        }
        return tabs;
      }),
      sendMessage: vi.fn(async (_tabId: number, _message: { type?: string }) => {}),
      onCreated: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
      onReplaced: { addListener: vi.fn() }
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      Color: { ORANGE: 'orange' },
      update: vi.fn(
        async (id: number, props: { title?: string; color?: string; collapsed?: boolean }) => {
          if (!groupIds.has(id)) throw new Error(`No group ${id}`);
          if (typeof props?.title === 'string') groupTitles.set(id, props.title);
          if (typeof props?.color === 'string') groupColors.set(id, props.color);
          return {
            id,
            title: groupTitles.get(id) ?? '🦆SuperDuck',
            color: groupColors.get(id) ?? 'orange'
          };
        }
      ),
      query: vi.fn(async () =>
        Array.from(groupIds).map((id) => ({
          id,
          title: groupTitles.get(id) ?? '🦆SuperDuck',
          color: groupColors.get(id) ?? 'orange'
        }))
      ),
      get: vi.fn(async (id: number) => {
        if (!groupIds.has(id)) throw new Error(`No group ${id}`);
        return {
          id,
          title: groupTitles.get(id) ?? '🦆SuperDuck',
          color: groupColors.get(id) ?? 'orange'
        };
      })
    },
    debugger: {
      onEvent: { addListener: vi.fn() },
      onDetach: { addListener: vi.fn() }
    },
    storage: {
      session: storageArea(sessionStore),
      local: storageArea(localStore)
    },
    windows: { get: vi.fn(async () => ({})) },
    runtime: { getManifest: vi.fn(() => ({ version: '0.0.0-test' })) }
  };
});

vi.stubGlobal('chrome', chromeMock);

const { tabGroupManager } = await import('./tabGroups');
const { tabLeaseManager } = await import('./tabLeases');

type MutableTabGroupManager = typeof tabGroupManager & {
  groupMetadata: Map<number, unknown>;
  sessionGroupTitles: Map<string, string>;
  initialized: boolean;
  mcpTabGroupId: number | null;
};

const manager = tabGroupManager as MutableTabGroupManager;
const leases = tabLeaseManager as unknown as {
  leases: Map<number, unknown>;
  initialized: boolean;
};

beforeEach(() => {
  chromeMock.reset();
  manager.groupMetadata.clear();
  manager.sessionGroupTitles.clear();
  manager.initialized = true;
  manager.mcpTabGroupId = null;
  leases.leases.clear();
  leases.initialized = false;
  chromeMock.tabs.create.mockClear();
  chromeMock.tabs.group.mockClear();
  chromeMock.tabs.ungroup.mockClear();
  chromeMock.tabs.remove.mockClear();
  chromeMock.storage.session.get.mockClear();
  chromeMock.storage.session.set.mockClear();
  chromeMock.storage.session.remove.mockClear();
});

describe('TabGroupManager session-scoped MCP leases', () => {
  it('reuses active tabs for the same session without rewriting active lease turn', async () => {
    const first = await tabGroupManager.getOrCreateMcpTabContext({
      createIfEmpty: true,
      sessionId: 'session-a',
      turnId: 'turn-1'
    });
    const second = await tabGroupManager.getOrCreateMcpTabContext({
      createIfEmpty: true,
      sessionId: 'session-a',
      turnId: 'turn-2'
    });

    expect(first?.currentTabId).toBe(7);
    expect(second?.currentTabId).toBe(7);
    expect(second?.tabGroupId).toBe(first?.tabGroupId);
    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1);
    expect(await tabLeaseManager.getLease(7)).toMatchObject({
      sessionId: 'session-a',
      turnId: 'turn-1',
      state: 'active'
    });
  });

  it('nameSession titles the session group with the 🦆 marker and preserves it', async () => {
    const ctx = await tabGroupManager.getOrCreateMcpTabContext({
      createIfEmpty: true,
      sessionId: 'session-a',
      turnId: 'turn-1'
    });
    const groupId = ctx?.tabGroupId;
    expect(groupId).toBeDefined();

    chromeMock.tabGroups.update.mockClear();
    const result = await tabGroupManager.nameSession('session-a', '🔎 research');
    // The 🦆 marker is always present; the name follows it.
    expect(result?.title).toBe('🦆 🔎 research');
    expect(tabGroupManager.resolveGroupTitle('session-a')).toBe('🦆 🔎 research');
    expect(tabGroupManager.resolveGroupTitle('session-b')).toBe('🦆SuperDuck');
    // The active group is re-titled immediately (force-write).
    expect(chromeMock.tabGroups.update).toHaveBeenCalledWith(
      groupId,
      expect.objectContaining({ title: '🦆 🔎 research' })
    );

    // A later characteristics check preserves the branded title (no revert).
    chromeMock.tabGroups.update.mockClear();
    await tabGroupManager.ensureMcpGroupCharacteristics(groupId as number, 'session-a');
    expect(chromeMock.tabGroups.update).not.toHaveBeenCalled();

    // Clearing the name reverts to the default title (still 🦆-branded).
    chromeMock.tabGroups.update.mockClear();
    await tabGroupManager.nameSession('session-a', '');
    expect(tabGroupManager.resolveGroupTitle('session-a')).toBe('🦆SuperDuck');
    expect(chromeMock.tabGroups.update).toHaveBeenCalledWith(
      groupId,
      expect.objectContaining({ title: '🦆SuperDuck' })
    );
  });

  it('createMcpTabGroup titles the group at creation when name is passed', async () => {
    const ctx = await tabGroupManager.createMcpTabGroup({
      sessionId: 'session-d',
      turnId: 'turn-1',
      name: '🔎 deepseek research'
    });
    const groupId = ctx?.tabGroupId;
    expect(groupId).toBeDefined();
    // Title applied immediately at creation; 🦆 marker auto-prepended.
    expect(tabGroupManager.resolveGroupTitle('session-d')).toBe('🦆 🔎 deepseek research');
    expect(chromeMock.tabGroups.update).toHaveBeenCalledWith(
      groupId,
      expect.objectContaining({ title: '🦆 🔎 deepseek research' })
    );
  });

  it('getOrCreateMcpTabContext titles the group when name is passed via createIfEmpty', async () => {
    const ctx = await tabGroupManager.getOrCreateMcpTabContext({
      createIfEmpty: true,
      sessionId: 'session-e',
      turnId: 'turn-1',
      name: '🔎 xiaohongshu search'
    });
    const groupId = ctx?.tabGroupId;
    expect(groupId).toBeDefined();
    expect(tabGroupManager.resolveGroupTitle('session-e')).toBe('🦆 🔎 xiaohongshu search');
    expect(chromeMock.tabGroups.update).toHaveBeenCalledWith(
      groupId,
      expect.objectContaining({ title: '🦆 🔎 xiaohongshu search' })
    );
  });

  it('nameActiveMcpGroup titles the unscoped global group for the sidepanel', async () => {
    // Sidepanel path: no session scope, names the active global mcpTabGroupId.
    const ctx = await tabGroupManager.getOrCreateMcpTabContext({ createIfEmpty: true });
    expect(ctx?.tabGroupId).toBeDefined();

    const result = await tabGroupManager.nameActiveMcpGroup('🔎 sidepanel task');
    expect(result?.title).toBe('🦆 🔎 sidepanel task');
    expect(tabGroupManager.resolveGroupTitle()).toBe('🦆 🔎 sidepanel task');
    // A scoped session without its own name still falls back to the default,
    // not the sidepanel's name.
    expect(tabGroupManager.resolveGroupTitle('session-x')).toBe('🦆SuperDuck');

    await tabGroupManager.nameActiveMcpGroup('');
    expect(tabGroupManager.resolveGroupTitle()).toBe('🦆SuperDuck');
  });

  it('nameActiveMcpGroup set before a group exists applies once the group is created', async () => {
    // Name the unscoped session while no tab group exists yet. The title is
    // stored; the group built afterwards must carry it (🦆-prefixed).
    const stored = await tabGroupManager.nameActiveMcpGroup('pre-set name');
    expect(stored).toBeUndefined();
    expect(tabGroupManager.resolveGroupTitle()).toBe('🦆 pre-set name');

    const ctx = await tabGroupManager.getOrCreateMcpTabContext({ createIfEmpty: true });
    const group = await chrome.tabGroups.get(ctx?.tabGroupId as number);
    expect(group.title).toBe('🦆 pre-set name');
  });

  it('updateGroupTitle re-names the unscoped group on every conversation, keeping 🦆', async () => {
    // Sidepanel single-session path: the agent works on a managed tab and the
    // loop calls updateGroupTitle once per conversation. The first conversation
    // names the group; a later conversation must be able to rename it instead
    // of being blocked by the previous title.
    const ctx = await tabGroupManager.getOrCreateMcpTabContext({ createIfEmpty: true });
    const mainTabId = ctx?.currentTabId;
    expect(mainTabId).toBeDefined();

    chromeMock.tabGroups.update.mockClear();
    await tabGroupManager.updateGroupTitle(mainTabId as number, 'first task', true);
    let group = await chrome.tabGroups.get(ctx?.tabGroupId as number);
    expect(group.title).toBe('⌛🦆 first task');

    // A second conversation renames the same group.
    chromeMock.tabGroups.update.mockClear();
    await tabGroupManager.updateGroupTitle(mainTabId as number, 'second task', true);
    group = await chrome.tabGroups.get(ctx?.tabGroupId as number);
    expect(group.title).toBe('⌛🦆 second task');

    // An explicit session name takes precedence and blocks auto-naming.
    await tabGroupManager.nameActiveMcpGroup('pinned name');
    chromeMock.tabGroups.update.mockClear();
    await tabGroupManager.updateGroupTitle(mainTabId as number, 'auto title', true);
    group = await chrome.tabGroups.get(ctx?.tabGroupId as number);
    expect(group.title).toBe('🦆 pinned name');
    expect(chromeMock.tabGroups.update).not.toHaveBeenCalled();

    // Clearing the explicit name re-enables auto-naming.
    await tabGroupManager.nameActiveMcpGroup('');
    await tabGroupManager.updateGroupTitle(mainTabId as number, 'auto again', true);
    group = await chrome.tabGroups.get(ctx?.tabGroupId as number);
    expect(group.title).toBe('⌛🦆 auto again');
  });

  it('does not reuse another session active tab and reports explicit conflicts', async () => {
    const first = await tabGroupManager.getOrCreateMcpTabContext({
      createIfEmpty: true,
      sessionId: 'session-a',
      turnId: 'turn-1'
    });
    const second = await tabGroupManager.getOrCreateMcpTabContext({
      createIfEmpty: true,
      sessionId: 'session-b',
      turnId: 'turn-1'
    });

    expect(second?.currentTabId).not.toBe(first?.currentTabId);
    expect(second?.tabGroupId).not.toBe(first?.tabGroupId);
    await expect(
      tabGroupManager.getTabForMcp(first?.currentTabId, undefined, {
        sessionId: 'session-b',
        turnId: 'turn-1'
      })
    ).rejects.toThrow('already part of browser session session-a');
  });

  it('finalize handoff keeps the lease dormant and resumes it for a later turn', async () => {
    const context = await tabGroupManager.getOrCreateMcpTabContext({
      createIfEmpty: true,
      sessionId: 'session-a',
      turnId: 'turn-1'
    });
    expect(context).toBeDefined();

    const finalized = await tabGroupManager.finalizeMcpTabGroup({
      sessionId: 'session-a',
      turnId: 'turn-1',
      keep: [{ tabId: context!.currentTabId, status: 'handoff' }]
    });

    expect(finalized?.currentTabId).toBe(context!.currentTabId);
    expect(await tabLeaseManager.getLease(context!.currentTabId)).toMatchObject({
      sessionId: 'session-a',
      state: 'handoff'
    });

    const resumed = await tabGroupManager.getOrCreateMcpTabContext({
      sessionId: 'session-a',
      turnId: 'turn-2'
    });

    expect(resumed?.currentTabId).toBe(context!.currentTabId);
    expect(await tabLeaseManager.getLease(context!.currentTabId)).toMatchObject({
      state: 'active',
      turnId: 'turn-2'
    });
  });

  it('rejects explicit access to another session handoff tab', async () => {
    const context = await tabGroupManager.getOrCreateMcpTabContext({
      createIfEmpty: true,
      sessionId: 'session-a',
      turnId: 'turn-1'
    });
    expect(context).toBeDefined();

    await tabGroupManager.finalizeMcpTabGroup({
      sessionId: 'session-a',
      turnId: 'turn-1',
      keep: [{ tabId: context!.currentTabId, status: 'handoff' }]
    });

    await expect(
      tabGroupManager.getTabForMcp(context!.currentTabId, undefined, {
        sessionId: 'session-b',
        turnId: 'turn-1'
      })
    ).rejects.toThrow('already part of browser session session-a');
    expect(await tabLeaseManager.getLease(context!.currentTabId)).toMatchObject({
      sessionId: 'session-a',
      state: 'handoff'
    });
  });

  it('keeps live session tabs when an earlier lease is stale (closed tab / dissolved group)', async () => {
    const ctx = await tabGroupManager.getOrCreateMcpTabContext({
      createIfEmpty: true,
      sessionId: 'session-a',
      turnId: 'turn-1'
    });
    const t1 = ctx!.currentTabId;
    const g1 = ctx!.tabGroupId;

    // A second live tab the session owns, in its own group.
    const t2Tab = (await chrome.tabs.create({ url: 'https://two.test/' })) as MockTab;
    const t2 = t2Tab.id;
    const g2 = await chrome.tabs.group({ tabIds: [t2] });
    await tabLeaseManager.claimTab('session-a', 'turn-1', t2, 'agent', { groupId: g2 });

    // Make the first (insertion-order) lease unresolvable: close t1 and
    // dissolve its group. Previously this caused buildSessionContextFromLeases
    // to release ALL session leases and return undefined, dropping live t2.
    chromeMock.tabsById.delete(t1);
    chromeMock.groupIds.delete(g1);

    const resumed = await tabGroupManager.getOrCreateMcpTabContext({
      sessionId: 'session-a',
      turnId: 'turn-2'
    });

    expect(resumed?.currentTabId).toBe(t2);
    expect(resumed?.tabGroupId).toBe(g2);
    expect(await tabLeaseManager.getLease(t2)).toMatchObject({
      sessionId: 'session-a',
      state: 'active'
    });
  });

  it('hideAgentIndicatorsForTab commits state to none and sends a retried HIDE (heartbeat truth flips)', async () => {
    const ctx = await tabGroupManager.getOrCreateMcpTabContext({
      createIfEmpty: true,
      sessionId: 'session-a',
      turnId: 'turn-1'
    });
    const tabId = ctx!.currentTabId;

    await tabGroupManager.setTabIndicatorState(tabId, 'pulsing');
    expect(tabGroupManager.getTabIndicatorState(tabId)).toBe('pulsing');

    chromeMock.tabs.sendMessage.mockClear();
    await tabGroupManager.hideAgentIndicatorsForTab(tabId);

    // Backend truth flips to none even if the content-script HIDE were dropped —
    // this is what the agent-overlay heartbeat reads to self-hide.
    expect(tabGroupManager.getTabIndicatorState(tabId)).toBe('none');
    const hideCall = chromeMock.tabs.sendMessage.mock.calls.find(
      (c) => (c[1] as { type?: string }).type === 'HIDE_AGENT_INDICATORS'
    );
    expect(hideCall).toBeDefined();

    // The agent-overlay heartbeat reads getTabIndicatorState as its truth
    // source. While pulsing it would answer success:true (keep overlay); after
    // hideAgentIndicatorsForTab it is 'none' (success:false → self-hide a
    // lingering overlay that missed the HIDE).
    expect(tabGroupManager.getTabIndicatorState(tabId)).toBe('none');
    await tabGroupManager.setTabIndicatorState(tabId, 'pulsing');
    expect(tabGroupManager.getTabIndicatorState(tabId)).toBe('pulsing');
  });

  it('clears stale pulsing indicators on SW restart (reconcileWithChrome first-init)', async () => {
    const ctx = await tabGroupManager.getOrCreateMcpTabContext({
      createIfEmpty: true,
      sessionId: 'session-a',
      turnId: 'turn-1'
    });
    const tabId = ctx!.currentTabId;
    await tabGroupManager.setTabIndicatorState(tabId, 'pulsing');
    expect(tabGroupManager.getTabIndicatorState(tabId)).toBe('pulsing');

    chromeMock.tabs.sendMessage.mockClear();
    // Simulate a service-worker restart: the 20s finalizeGroup timer is gone,
    // so a leftover "pulsing" state would linger forever. First-init reconcile
    // must flip it to "none" and hide the overlay.
    await tabGroupManager.reconcileWithChrome(true);

    expect(tabGroupManager.getTabIndicatorState(tabId)).toBe('none');
    const hideCall = chromeMock.tabs.sendMessage.mock.calls.find(
      (c) => (c[1] as { type?: string }).type === 'HIDE_AGENT_INDICATORS'
    );
    expect(hideCall).toBeDefined();

    // A force re-init during a live session (not first init) must NOT clear
    // an intended pulsing state.
    await tabGroupManager.setTabIndicatorState(tabId, 'pulsing');
    await tabGroupManager.reconcileWithChrome(false);
    expect(tabGroupManager.getTabIndicatorState(tabId)).toBe('pulsing');
  });

  it('resumes a same-session handoff lease on explicit tab access', async () => {
    const context = await tabGroupManager.getOrCreateMcpTabContext({
      createIfEmpty: true,
      sessionId: 'session-a',
      turnId: 'turn-1'
    });
    expect(context).toBeDefined();

    await tabGroupManager.finalizeMcpTabGroup({
      sessionId: 'session-a',
      turnId: 'turn-1',
      keep: [{ tabId: context!.currentTabId, status: 'handoff' }]
    });

    const tabInfo = await tabGroupManager.getTabForMcp(context!.currentTabId, undefined, {
      sessionId: 'session-a',
      turnId: 'turn-2'
    });

    expect(tabInfo.tabId).toBe(context!.currentTabId);
    expect(await tabLeaseManager.getLease(context!.currentTabId)).toMatchObject({
      sessionId: 'session-a',
      turnId: 'turn-2',
      state: 'active'
    });
  });

  it('propagates session conflicts before adding a tab to the group', async () => {
    const context = await tabGroupManager.getOrCreateMcpTabContext({
      createIfEmpty: true,
      sessionId: 'session-a',
      turnId: 'turn-1'
    });
    expect(context).toBeDefined();
    const otherTab: MockTab = {
      id: 20,
      windowId: 1,
      groupId: -1,
      url: 'https://other.example/',
      title: 'Other',
      index: 2
    };
    chromeMock.tabsById.set(otherTab.id, otherTab);
    await tabLeaseManager.claimTab('session-b', 'turn-1', otherTab.id, 'user');
    chromeMock.tabs.group.mockClear();

    await expect(
      tabGroupManager.addTabToGroup(context!.currentTabId, otherTab.id, {
        sessionId: 'session-a',
        turnId: 'turn-2',
        origin: 'agent'
      })
    ).rejects.toThrow('already part of browser session session-b');

    expect(chromeMock.tabs.group).not.toHaveBeenCalled();
    expect(chromeMock.tabsById.get(otherTab.id)?.groupId).toBe(-1);
    expect(await tabLeaseManager.getLease(otherTab.id)).toMatchObject({
      sessionId: 'session-b',
      state: 'active'
    });
  });

  it('propagates session conflicts when reusing an existing child tab', async () => {
    const context = await tabGroupManager.getOrCreateMcpTabContext({
      createIfEmpty: true,
      sessionId: 'session-a',
      turnId: 'turn-1'
    });
    expect(context).toBeDefined();
    const childTab: MockTab = {
      id: 21,
      windowId: 1,
      groupId: -1,
      url: 'https://child.example/',
      title: 'Child',
      index: 2,
      openerTabId: context!.currentTabId
    };
    chromeMock.tabsById.set(childTab.id, childTab);
    await tabLeaseManager.claimTab('session-b', 'turn-1', childTab.id, 'user');
    chromeMock.tabs.create.mockClear();
    chromeMock.tabs.group.mockClear();

    await expect(
      tabGroupManager.createChildTabInGroup(context!.currentTabId, childTab.url, {
        sessionId: 'session-a',
        turnId: 'turn-2'
      })
    ).rejects.toThrow('already part of browser session session-b');

    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    expect(chromeMock.tabs.group).not.toHaveBeenCalled();
    expect(chromeMock.tabsById.get(childTab.id)?.groupId).toBe(-1);
    expect(await tabLeaseManager.getLease(childTab.id)).toMatchObject({
      sessionId: 'session-b',
      state: 'active'
    });
  });

  it('fresh MCP group supersedes same-session handoff leases', async () => {
    const first = await tabGroupManager.getOrCreateMcpTabContext({
      createIfEmpty: true,
      sessionId: 'session-a',
      turnId: 'turn-1'
    });
    expect(first).toBeDefined();

    await tabGroupManager.finalizeMcpTabGroup({
      sessionId: 'session-a',
      turnId: 'turn-1',
      keep: [{ tabId: first!.currentTabId, status: 'handoff' }]
    });
    expect(await tabLeaseManager.getLease(first!.currentTabId)).toMatchObject({
      state: 'handoff'
    });

    const fresh = await tabGroupManager.createMcpTabGroup({
      sessionId: 'session-a',
      turnId: 'turn-2',
      replaceExisting: true
    });

    expect(fresh.currentTabId).not.toBe(first!.currentTabId);
    expect(fresh.tabGroupId).not.toBe(first!.tabGroupId);
    expect(await tabLeaseManager.getLease(first!.currentTabId)).toBeUndefined();
    expect(await tabLeaseManager.getLease(fresh.currentTabId)).toMatchObject({
      sessionId: 'session-a',
      turnId: 'turn-2',
      state: 'active'
    });

    const reused = await tabGroupManager.getOrCreateMcpTabContext({
      sessionId: 'session-a',
      turnId: 'turn-3'
    });

    expect(reused?.currentTabId).toBe(fresh.currentTabId);
    expect(reused?.tabGroupId).toBe(fresh.tabGroupId);
  });

  it('does not create a fresh group for a session that already has an active group', async () => {
    const first = await tabGroupManager.getOrCreateMcpTabContext({
      createIfEmpty: true,
      sessionId: 'session-a',
      turnId: 'turn-1'
    });
    expect(first).toBeDefined();
    chromeMock.tabs.create.mockClear();

    await expect(
      tabGroupManager.createMcpTabGroup({
        sessionId: 'session-a',
        turnId: 'turn-2'
      })
    ).rejects.toThrow('use tab_group list --create-if-empty to reuse tab');

    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    expect(await tabLeaseManager.getLease(first!.currentTabId)).toMatchObject({
      sessionId: 'session-a',
      state: 'active'
    });
  });

  it('finalize deliverable ungroups the tab and releases its lease', async () => {
    const context = await tabGroupManager.getOrCreateMcpTabContext({
      createIfEmpty: true,
      sessionId: 'session-a',
      turnId: 'turn-1'
    });
    expect(context).toBeDefined();

    const finalized = await tabGroupManager.finalizeMcpTabGroup({
      sessionId: 'session-a',
      turnId: 'turn-1',
      keep: [{ tabId: context!.currentTabId, status: 'deliverable' }]
    });

    expect(finalized).toBeUndefined();
    expect(chromeMock.tabsById.get(context!.currentTabId)?.groupId).toBe(-1);
    expect(await tabLeaseManager.getLease(context!.currentTabId)).toBeUndefined();
  });

  it('resumes the primary handoff tab even when it no longer sorts first by index', async () => {
    const ctx = await tabGroupManager.getOrCreateMcpTabContext({
      createIfEmpty: true,
      sessionId: 'session-a',
      turnId: 'turn-1'
    });
    const mainTabId = ctx!.currentTabId;
    const groupId = ctx!.tabGroupId;

    // Add a second tab to the same managed group + session.
    const secondTab: MockTab = {
      id: 8,
      windowId: 1,
      groupId,
      url: 'https://second.example/',
      title: 'Second',
      index: 1
    };
    chromeMock.tabsById.set(8, secondTab);
    await tabLeaseManager.claimTab('session-a', 'turn-1', 8, 'agent', { groupId });

    // Hand off both; activeTabId defaults to the turn's currentTabId (mainTabId).
    await tabGroupManager.finalizeMcpTabGroup({
      sessionId: 'session-a',
      turnId: 'turn-1',
      keep: [
        { tabId: mainTabId, status: 'handoff' },
        { tabId: 8, status: 'handoff' }
      ]
    });
    expect((await tabLeaseManager.getLease(mainTabId))?.isActiveHandoff).toBe(true);
    expect((await tabLeaseManager.getLease(8))?.isActiveHandoff).toBe(false);

    // Between turns the tabs get reordered so the secondary tab sorts first.
    chromeMock.tabsById.get(mainTabId)!.index = 1;
    chromeMock.tabsById.get(8)!.index = 0;

    const resumed = await tabGroupManager.getOrCreateMcpTabContext({
      sessionId: 'session-a',
      turnId: 'turn-2'
    });

    // Without the isActiveHandoff marker, currentTabId would be 8 (now index 0).
    // The marker keeps the next turn on the tab the agent was actually driving.
    expect(resumed?.currentTabId).toBe(mainTabId);
  });
});
