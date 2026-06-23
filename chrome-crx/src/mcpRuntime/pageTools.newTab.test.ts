import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from './pageToolsSupport/types';

const fixtures = vi.hoisted(() => {
  const checkPermission = vi.fn();
  const getCategory = vi.fn();
  const getEffectiveTabId = vi.fn();
  const getMainTabId = vi.fn();
  const addTabToGroup = vi.fn();
  const getValidTabsWithMetadata = vi.fn();

  return {
    checkPermission,
    getCategory,
    getEffectiveTabId,
    getMainTabId,
    addTabToGroup,
    getValidTabsWithMetadata
  };
});

vi.mock('./tabState', () => ({
  domainCategoryCache: {
    getCategory: fixtures.getCategory
  },
  tabGroupManager: {
    getEffectiveTabId: fixtures.getEffectiveTabId,
    getMainTabId: fixtures.getMainTabId,
    addTabToGroup: fixtures.addTabToGroup,
    getValidTabsWithMetadata: fixtures.getValidTabsWithMetadata
  }
}));

vi.mock('./cdp', () => ({
  cdpDebugger: {}
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
  permissionManager: {
    checkPermission: fixtures.checkPermission
  } as unknown as ToolContext['permissionManager']
};

beforeEach(() => {
  fixtures.checkPermission.mockReset();
  fixtures.getCategory.mockReset();
  fixtures.getEffectiveTabId.mockReset();
  fixtures.getMainTabId.mockReset();
  fixtures.addTabToGroup.mockReset();
  fixtures.getValidTabsWithMetadata.mockReset();
  chromeMock.tabs.create.mockReset();
  chromeMock.tabs.get.mockReset();
  chromeMock.tabs.group.mockReset();
  chromeMock.tabs.update.mockReset();

  fixtures.checkPermission.mockResolvedValue({ allowed: true });
  fixtures.getCategory.mockResolvedValue(null);
  fixtures.getEffectiveTabId.mockImplementation(
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
    expect(fixtures.addTabToGroup).toHaveBeenCalledWith(10, 31);
    expect(chromeMock.tabs.group).not.toHaveBeenCalled();
    expect(result.tabContext).toMatchObject({
      currentTabId: 10,
      executedOnTabId: 31,
      tabCount: 2
    });
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
    expect(fixtures.addTabToGroup).toHaveBeenCalledWith(10, 31);
    expect(result.output).toContain('Opened https://example.com/search?q=agent');
    expect(result.tabContext).toMatchObject({
      currentTabId: 10,
      executedOnTabId: 31,
      tabCount: 2
    });
  });
});
