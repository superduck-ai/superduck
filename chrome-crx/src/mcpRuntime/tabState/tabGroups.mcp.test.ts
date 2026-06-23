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
  status?: string;
};

const chromeMock = vi.hoisted(() => ({
  tabs: {
    create: vi.fn(
      async (): Promise<MockTab> => ({
        id: 7,
        windowId: 1,
        groupId: -1,
        url: 'chrome://newtab',
        title: 'New Tab',
        index: 2
      })
    ),
    group: vi.fn(async () => 123),
    ungroup: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    update: vi.fn(async () => ({})),
    get: vi.fn(
      async (id: number): Promise<MockTab> => ({
        id,
        windowId: 1,
        groupId: id === 7 ? -1 : 123,
        url: id === 10 ? 'https://example.com/' : 'chrome://newtab',
        title: `Tab ${id}`,
        index: id === 10 ? 0 : 1
      })
    ),
    query: vi.fn(async (queryInfo?: { groupId?: number; active?: boolean }): Promise<MockTab[]> => {
      if (queryInfo?.active) {
        return [
          {
            id: 99,
            windowId: 1,
            groupId: -1,
            url: 'https://user.example/',
            title: 'User Tab',
            index: 3,
            active: true
          }
        ];
      }
      if (queryInfo?.groupId === 123) {
        return [
          {
            id: 20,
            windowId: 1,
            groupId: 123,
            url: 'https://later.example/',
            title: 'Later',
            index: 1
          },
          {
            id: 10,
            windowId: 1,
            groupId: 123,
            url: 'https://example.com/',
            title: 'First',
            index: 0
          }
        ];
      }
      return [];
    }),
    sendMessage: vi.fn(async () => {}),
    onCreated: { addListener: vi.fn() },
    onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn() }
  },
  tabGroups: {
    TAB_GROUP_ID_NONE: -1,
    Color: { ORANGE: 'orange' },
    update: vi.fn(async () => {}),
    query: vi.fn(async () => [{ id: 123, title: '🦆SuperDuck', color: 'orange' }]),
    get: vi.fn(async () => ({ id: 123, title: '🦆SuperDuck', color: 'orange' }))
  },
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
      remove: vi.fn(async () => {})
    }
  },
  windows: {
    create: vi.fn(async () => {
      throw new Error('MCP group creation should not create or focus a new window');
    }),
    get: vi.fn(async () => ({}))
  },
  runtime: { getManifest: vi.fn(() => ({ version: '0.0.0-test' })) }
}));

vi.stubGlobal('chrome', chromeMock);

const { tabGroupManager } = await import('./tabGroups');
const { createPolicyCheckedChildTab, moveSearchNavigationToNewTab, filterPolicyAllowedTabs } =
  await import('../navigationIsolation');

type MutableTabGroupManager = typeof tabGroupManager & {
  groupMetadata: Map<number, unknown>;
  initialized: boolean;
  mcpTabGroupId: number | null;
  childTabNavigationPoliciesByOpener: Map<number, { timeoutId?: ReturnType<typeof setTimeout> }>;
};

const manager = tabGroupManager as MutableTabGroupManager;

beforeEach(() => {
  manager.groupMetadata.clear();
  manager.initialized = true;
  manager.mcpTabGroupId = null;
  for (const policy of manager.childTabNavigationPoliciesByOpener.values()) {
    if (policy.timeoutId) clearTimeout(policy.timeoutId);
  }
  manager.childTabNavigationPoliciesByOpener.clear();

  chromeMock.tabs.create.mockClear();
  chromeMock.tabs.group.mockClear();
  chromeMock.tabs.update.mockClear();
  chromeMock.tabs.remove.mockClear();
  chromeMock.tabs.get.mockClear();
  chromeMock.tabs.query.mockClear();
  chromeMock.tabs.onUpdated.addListener.mockClear();
  chromeMock.tabs.onUpdated.removeListener.mockClear();
  chromeMock.tabGroups.update.mockClear();
  chromeMock.tabGroups.get.mockClear();
  chromeMock.tabGroups.query.mockClear();
  chromeMock.storage.local.get.mockClear();
  chromeMock.storage.local.set.mockClear();
  chromeMock.storage.local.remove.mockClear();
  chromeMock.windows.create.mockClear();
});

describe('TabGroupManager MCP tab groups', () => {
  it('creates fresh MCP tab groups in the background', async () => {
    const context = await tabGroupManager.createMcpTabGroup();

    expect(chromeMock.tabs.create).toHaveBeenCalledWith({
      url: 'chrome://newtab',
      active: false
    });
    expect(chromeMock.windows.create).not.toHaveBeenCalled();
    expect(chromeMock.tabs.group).toHaveBeenCalledWith({ tabIds: [7] });
    expect(context.currentTabId).toBe(7);
    expect(context.tabGroupId).toBe(123);
    expect(manager.mcpTabGroupId).toBe(123);
  });

  it('uses the current MCP group when an MCP tool omits tabId', async () => {
    const tabInfo = await tabGroupManager.getTabForMcp();

    expect(tabInfo).toEqual({
      tabId: 10,
      domain: 'example.com',
      url: 'https://example.com/'
    });
  });

  it('adopts policy-allowed tabs opened by the MCP group and restores the user tab', async () => {
    await tabGroupManager.createMcpTabGroup();
    tabGroupManager.rememberChildTabNavigationPolicy(7, {
      permissionManager: { checkPermission: async () => ({ allowed: true }) },
      toolUseId: undefined,
      toolName: 'test'
    });
    await tabGroupManager.withPreservedActiveTab(7, async () => {
      await tabGroupManager.handleTabCreated({
        id: 31,
        openerTabId: 7,
        windowId: 1,
        groupId: -1,
        url: 'https://example.com/search?q=agent',
        title: 'agent',
        index: 4,
        active: true
      } as chrome.tabs.Tab);
    });

    expect(chromeMock.tabs.group).toHaveBeenCalledWith({ tabIds: [31], groupId: 123 });
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(99, { active: true });
  });

  it('keeps watching globally adopted allowed tabs and closes later disallowed redirects', async () => {
    await tabGroupManager.createMcpTabGroup();
    chromeMock.tabs.group.mockClear();
    tabGroupManager.rememberChildTabNavigationPolicy(7, {
      permissionManager: {
        checkPermission: async (url: string) => ({ allowed: url.startsWith('https://allowed.') })
      },
      toolUseId: undefined,
      toolName: 'test'
    });

    await tabGroupManager.withPreservedActiveTab(7, async () => {
      await tabGroupManager.handleTabCreated({
        id: 33,
        openerTabId: 7,
        windowId: 1,
        groupId: -1,
        url: 'https://allowed.example/',
        title: 'allowed',
        index: 4,
        active: true
      } as chrome.tabs.Tab);
    });

    expect(chromeMock.tabs.group).toHaveBeenCalledWith({ tabIds: [33], groupId: 123 });
    const listener = chromeMock.tabs.onUpdated.addListener.mock.calls[0]?.[0] as
      | ((tabId: number, changeInfo: { url?: string }) => void)
      | undefined;
    expect(listener).toBeDefined();

    listener?.(33, { url: 'https://allowed.example/redirect' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(chromeMock.tabs.remove).not.toHaveBeenCalledWith(33);

    listener?.(33, { url: 'https://blocked.example/' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(chromeMock.tabs.remove).toHaveBeenCalledWith(33);
    expect(chromeMock.tabs.onUpdated.removeListener).toHaveBeenCalledWith(listener);
  });

  it('closes policy-disallowed popup tabs before grouping them', async () => {
    await tabGroupManager.createMcpTabGroup();
    chromeMock.tabs.group.mockClear();
    tabGroupManager.rememberChildTabNavigationPolicy(7, {
      permissionManager: { checkPermission: async () => ({ allowed: false, needsPrompt: true }) },
      toolUseId: undefined,
      toolName: 'test'
    });

    await tabGroupManager.withPreservedActiveTab(7, async () => {
      await tabGroupManager.handleTabCreated({
        id: 32,
        openerTabId: 7,
        windowId: 1,
        groupId: -1,
        url: 'https://blocked.example/',
        title: 'blocked',
        index: 4,
        active: true
      } as chrome.tabs.Tab);
    });

    expect(chromeMock.tabs.remove).toHaveBeenCalledWith(32);
    expect(chromeMock.tabs.group).not.toHaveBeenCalledWith({ tabIds: [32], groupId: 123 });
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(99, { active: true });
  });

  it('moves same-tab search navigation into a new group tab', async () => {
    await tabGroupManager.createMcpTabGroup();
    chromeMock.tabs.create.mockResolvedValueOnce({
      id: 31,
      windowId: 1,
      groupId: -1,
      url: 'https://example.com/search?q=agent',
      title: 'agent',
      index: 3,
      openerTabId: 7
    });
    chromeMock.tabs.get.mockImplementation(async (id: number): Promise<MockTab> => {
      if (id === 7) {
        return {
          id,
          windowId: 1,
          groupId: 123,
          url: 'https://example.com/search?q=agent',
          title: 'agent',
          index: 0,
          status: 'complete'
        };
      }
      return {
        id,
        windowId: 1,
        groupId: 123,
        url: 'https://example.com/search?q=agent',
        title: `Tab ${id}`,
        index: 1,
        status: 'complete'
      };
    });

    const openedTabs = await moveSearchNavigationToNewTab({
      openerTabId: 7,
      previousUrl: 'https://example.com/',
      timeoutMs: 100,
      policy: {
        permissionManager: { checkPermission: async () => ({ allowed: true }) },
        toolUseId: undefined,
        toolName: 'test'
      }
    });

    expect(openedTabs).toEqual([31]);
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({
      url: 'https://example.com/search?q=agent',
      active: false,
      openerTabId: 7
    });
    expect(chromeMock.tabs.group).toHaveBeenCalledWith({ tabIds: [31], groupId: 123 });
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(7, {
      url: 'https://example.com/'
    });
  });

  it('does not open the search-result tab when the destination lacks permission', async () => {
    await tabGroupManager.createMcpTabGroup();
    chromeMock.tabs.get.mockImplementation(
      async (id: number): Promise<MockTab> => ({
        id,
        windowId: 1,
        groupId: 123,
        url: 'https://search.example.org/?q=agent',
        title: `Tab ${id}`,
        index: 0,
        status: 'complete'
      })
    );
    chromeMock.tabs.create.mockClear();

    const openedTabs = await moveSearchNavigationToNewTab({
      openerTabId: 7,
      previousUrl: 'https://example.com/',
      timeoutMs: 100,
      policy: {
        permissionManager: { checkPermission: async () => ({ allowed: false, needsPrompt: true }) },
        toolUseId: undefined,
        toolName: 'test'
      }
    });

    expect(openedTabs).toEqual([]);
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    // Even though the destination was blocked, the opener must be restored to
    // the previous URL so it is not left on the policy-violating page.
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(7, {
      url: 'https://example.com/'
    });
  });

  it('watches policy-created child tabs and closes later disallowed redirects', async () => {
    await tabGroupManager.createMcpTabGroup();
    chromeMock.tabs.create.mockResolvedValueOnce({
      id: 31,
      windowId: 1,
      groupId: -1,
      url: 'https://allowed.example/',
      title: 'allowed',
      index: 3,
      openerTabId: 7
    });
    chromeMock.tabs.get.mockImplementation(
      async (id: number): Promise<MockTab> => ({
        id,
        windowId: 1,
        groupId: 123,
        url: id === 31 ? 'https://allowed.example/' : 'https://example.com/',
        title: `Tab ${id}`,
        index: id === 31 ? 1 : 0,
        status: 'complete'
      })
    );

    const tabId = await createPolicyCheckedChildTab(7, 'https://allowed.example/', {
      permissionManager: {
        checkPermission: async (url: string) => ({ allowed: url.startsWith('https://allowed.') })
      },
      toolUseId: undefined,
      toolName: 'test'
    });

    expect(tabId).toBe(31);
    const listener = chromeMock.tabs.onUpdated.addListener.mock.calls[0]?.[0] as
      | ((tabId: number, changeInfo: { url?: string }) => void)
      | undefined;
    expect(listener).toBeDefined();

    listener?.(31, { url: 'https://allowed.example/redirect' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(chromeMock.tabs.remove).not.toHaveBeenCalledWith(31);

    listener?.(31, { url: 'https://blocked.example/' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(chromeMock.tabs.remove).toHaveBeenCalledWith(31);
    expect(chromeMock.tabs.onUpdated.removeListener).toHaveBeenCalledWith(listener);
  });

  it('rechecks policy-created child tabs after attaching the redirect guard', async () => {
    await tabGroupManager.createMcpTabGroup();
    chromeMock.tabs.create.mockResolvedValueOnce({
      id: 31,
      windowId: 1,
      groupId: -1,
      url: 'https://allowed.example/',
      title: 'allowed',
      index: 3,
      openerTabId: 7
    });
    chromeMock.tabs.get.mockImplementation(
      async (id: number): Promise<MockTab> => ({
        id,
        windowId: 1,
        groupId: 123,
        url: id === 31 ? 'https://blocked.example/' : 'https://example.com/',
        title: `Tab ${id}`,
        index: id === 31 ? 1 : 0,
        status: 'complete'
      })
    );

    const tabId = await createPolicyCheckedChildTab(7, 'https://allowed.example/', {
      permissionManager: {
        checkPermission: async (url: string) => ({ allowed: url.startsWith('https://allowed.') })
      },
      toolUseId: undefined,
      toolName: 'test'
    });

    expect(tabId).toBeNull();
    expect(chromeMock.tabs.onUpdated.addListener).toHaveBeenCalled();
    expect(chromeMock.tabs.remove).toHaveBeenCalledWith(31);
    const listener = chromeMock.tabs.onUpdated.addListener.mock.calls[0]?.[0];
    expect(chromeMock.tabs.onUpdated.removeListener).toHaveBeenCalledWith(listener);
  });

  it('closes adopted tabs whose destination fails the navigation policy', async () => {
    chromeMock.tabs.get.mockImplementation(
      async (id: number): Promise<MockTab> => ({
        id,
        windowId: 1,
        groupId: 123,
        url: id === 41 ? 'https://approved.example/' : 'https://blocked.example/',
        title: `Tab ${id}`,
        index: 0,
        status: 'complete'
      })
    );

    const kept = await filterPolicyAllowedTabs([41, 42], {
      permissionManager: {
        checkPermission: async (url: string) => ({ allowed: url.startsWith('https://approved.') })
      },
      toolUseId: undefined,
      toolName: 'test'
    });

    expect(kept).toEqual([41]);
    expect(chromeMock.tabs.remove).toHaveBeenCalledWith(42);
    expect(chromeMock.tabs.remove).not.toHaveBeenCalledWith(41);
  });

  it('keeps watching policy-allowed adopted tabs and closes later disallowed redirects', async () => {
    chromeMock.tabs.get.mockImplementation(
      async (id: number): Promise<MockTab> => ({
        id,
        windowId: 1,
        groupId: 123,
        url: 'https://allowed.example/',
        title: `Tab ${id}`,
        index: 0,
        status: 'complete'
      })
    );

    const kept = await filterPolicyAllowedTabs([41], {
      permissionManager: {
        checkPermission: async (url: string) => ({ allowed: url.startsWith('https://allowed.') })
      },
      toolUseId: undefined,
      toolName: 'test'
    });

    expect(kept).toEqual([41]);
    const listener = chromeMock.tabs.onUpdated.addListener.mock.calls[0]?.[0] as
      | ((tabId: number, changeInfo: { url?: string }) => void)
      | undefined;
    expect(listener).toBeDefined();

    listener?.(41, { url: 'https://allowed.example/redirect' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(chromeMock.tabs.remove).not.toHaveBeenCalledWith(41);

    listener?.(41, { url: 'https://blocked.example/' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(chromeMock.tabs.remove).toHaveBeenCalledWith(41);
    expect(chromeMock.tabs.onUpdated.removeListener).toHaveBeenCalledWith(listener);
  });
});
