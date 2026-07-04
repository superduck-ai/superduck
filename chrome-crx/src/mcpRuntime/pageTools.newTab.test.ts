import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from './pageToolsSupport/types';

const fixtures = vi.hoisted(() => {
  const checkPermission = vi.fn();
  const getCategory = vi.fn();
  const resolveTabForContext = vi.fn();
  const getMainTabId = vi.fn();
  const addTabToGroup = vi.fn();
  const getValidTabsWithMetadata = vi.fn();
  const claimTab = vi.fn();

  return {
    checkPermission,
    getCategory,
    resolveTabForContext,
    getMainTabId,
    addTabToGroup,
    getValidTabsWithMetadata,
    claimTab
  };
});

vi.mock('./tabState', () => ({
  domainCategoryCache: {
    getCategory: fixtures.getCategory
  },
  tabGroupManager: {
    resolveTabForContext: fixtures.resolveTabForContext,
    getMainTabId: fixtures.getMainTabId,
    addTabToGroup: fixtures.addTabToGroup,
    getValidTabsWithMetadata: fixtures.getValidTabsWithMetadata,
    getValidTabsWithMetadataForContext: fixtures.getValidTabsWithMetadata
  }
}));

vi.mock('./cdp', () => ({
  cdpDebugger: {}
}));

vi.mock('./tabState/tabLeases', () => ({
  tabLeaseManager: {
    claimTab: fixtures.claimTab
  }
}));

vi.mock('./axSnapshot', () => ({
  takeSnapshotUnlocked: vi.fn(),
  SnapshotMaxCharsError: class SnapshotMaxCharsError extends Error {},
  normalizeSnapshotForDiff: vi.fn((value: string) => value),
  withSnapshotLock: vi.fn(async (_tabId: number, fn: () => Promise<unknown>) => fn())
}));

vi.mock('./refBridge', () => ({
  registerRefsInPage: vi.fn(),
  pruneStaleRefs: vi.fn()
}));

vi.mock('./shared', () => ({
  PermissionTools: {
    NAVIGATE: 'navigate'
  },
  checkUrlSecurity: vi.fn()
}));

const chromeMock = vi.hoisted(() => ({
  tabs: {
    create: vi.fn(),
    get: vi.fn(),
    group: vi.fn(),
    update: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    onRemoved: {
      addListener: vi.fn()
    },
    onUpdated: {
      addListener: vi.fn()
    }
  },
  webNavigation: {
    onCommitted: {
      addListener: vi.fn()
    },
    onHistoryStateUpdated: {
      addListener: vi.fn()
    }
  },
  tabGroups: {
    TAB_GROUP_ID_NONE: -1
  }
}));

vi.stubGlobal('chrome', chromeMock);

const { tabsCreateTool, navigateTool } = await import('./pageTools');

const context: ToolContext = {
  tabId: 10,
  toolUseId: 'tool-use-1',
  browserSessionScope: { sessionId: 'session-a' },
  tabAccess: 'write',
  resolveTabId: async (requestedTabId, options) =>
    await fixtures.resolveTabForContext(requestedTabId, 10, {
      browserSessionScope: { sessionId: 'session-a' },
      tabAccess: options?.tabAccess ?? 'write'
    }),
  permissionManager: {
    checkPermission: fixtures.checkPermission
  } as unknown as ToolContext['permissionManager']
};

beforeEach(() => {
  fixtures.checkPermission.mockReset();
  fixtures.getCategory.mockReset();
  fixtures.resolveTabForContext.mockReset();
  fixtures.getMainTabId.mockReset();
  fixtures.addTabToGroup.mockReset();
  fixtures.getValidTabsWithMetadata.mockReset();
  fixtures.claimTab.mockReset();
  chromeMock.tabs.create.mockReset();
  chromeMock.tabs.get.mockReset();
  chromeMock.tabs.group.mockReset();
  chromeMock.tabs.update.mockReset();

  fixtures.checkPermission.mockResolvedValue({ allowed: true });
  fixtures.getCategory.mockResolvedValue(null);
  fixtures.claimTab.mockResolvedValue(undefined);
  fixtures.resolveTabForContext.mockImplementation(
    async (requested: number | undefined, current: number) => {
      return requested ?? current;
    }
  );
  fixtures.getMainTabId.mockResolvedValue(10);
  fixtures.getValidTabsWithMetadata.mockResolvedValue([
    { id: 10, title: 'Source', url: 'https://example.com/' },
    {
      id: 31,
      title: 'Results',
      url: 'https://example.com/search?q=agent'
    }
  ]);
  chromeMock.tabs.get.mockResolvedValue({
    id: 10,
    groupId: 123,
    url: 'https://example.com/'
  });
  chromeMock.tabs.create.mockResolvedValue({
    id: 31,
    groupId: -1,
    url: 'https://example.com/search?q=agent'
  });
});

describe('new background group tab navigation', () => {
  it('opens tabs_create url in the same group without activating it', async () => {
    const result = await tabsCreateTool.execute(
      { url: 'https://example.com/search?q=agent', tabId: 10 },
      context
    );

    expect(chromeMock.tabs.create).toHaveBeenCalledWith({
      url: 'https://example.com/search?q=agent',
      active: false,
      openerTabId: 10
    });
    expect(fixtures.addTabToGroup).toHaveBeenCalledWith(10, 31, {
      origin: 'agent',
      sessionId: 'session-a'
    });
    expect(chromeMock.tabs.group).not.toHaveBeenCalled();
    expect(result.tabContext).toMatchObject({
      currentTabId: 10,
      executedOnTabId: 31,
      tabCount: 2
    });
  });

  it('does not add tabs_create results to an unmanaged Chrome group', async () => {
    fixtures.getMainTabId.mockResolvedValueOnce(null);

    const result = await tabsCreateTool.execute(
      { url: 'https://example.com/search?q=agent', tabId: 10 },
      context
    );

    expect(chromeMock.tabs.create).toHaveBeenCalledWith({
      url: 'https://example.com/search?q=agent',
      active: false,
      openerTabId: 10
    });
    expect(fixtures.addTabToGroup).not.toHaveBeenCalled();
    expect(chromeMock.tabs.group).not.toHaveBeenCalled();
    expect(result.tabContext).toMatchObject({
      currentTabId: 10,
      executedOnTabId: 31
    });
  });

  it('rejects tabs_create when an explicit tab belongs to another browser session', async () => {
    fixtures.resolveTabForContext.mockRejectedValueOnce(
      new Error('Tab 99 is already part of browser session session-b')
    );

    const result = await tabsCreateTool.execute(
      { url: 'https://example.com/search?q=agent', tabId: 99 },
      {
        ...context,
        browserSessionScope: { sessionId: 'session-a' }
      }
    );

    expect(result.error).toContain('session-b');
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    expect(fixtures.resolveTabForContext).toHaveBeenCalledWith(
      99,
      10,
      expect.objectContaining({ browserSessionScope: { sessionId: 'session-a' } })
    );
  });

  it('opens navigate newTab url in the same group without replacing the source tab', async () => {
    const result = await navigateTool.execute(
      { url: 'https://example.com/search?q=agent', tabId: 10, newTab: true },
      context
    );

    expect(chromeMock.tabs.update).not.toHaveBeenCalled();
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({
      url: 'https://example.com/search?q=agent',
      active: false,
      openerTabId: 10
    });
    expect(fixtures.addTabToGroup).toHaveBeenCalledWith(10, 31, {
      origin: 'agent',
      sessionId: 'session-a'
    });
    expect(result.output).toContain('Opened https://example.com/search?q=agent');
    expect(result.tabContext).toMatchObject({
      currentTabId: 10,
      executedOnTabId: 31,
      tabCount: 2
    });
  });

  it('does not add navigate newTab results to an unmanaged Chrome group', async () => {
    fixtures.getMainTabId.mockResolvedValueOnce(null);
    chromeMock.tabs.get.mockImplementation(async (tabId: number) => {
      if (tabId === 31) {
        return {
          id: 31,
          groupId: -1,
          url: 'https://example.com/search?q=agent'
        };
      }
      return {
        id: 10,
        groupId: 123,
        url: 'https://example.com/'
      };
    });

    const result = await navigateTool.execute(
      { url: 'https://example.com/search?q=agent', tabId: 10, newTab: true },
      context
    );

    expect(fixtures.addTabToGroup).not.toHaveBeenCalled();
    expect(chromeMock.tabs.group).not.toHaveBeenCalled();
    expect(fixtures.claimTab).toHaveBeenCalledWith('session-a', 31, 'agent', {
      groupId: undefined
    });
    expect(result.tabContext).toMatchObject({
      currentTabId: 10,
      executedOnTabId: 31
    });
  });
});
