import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from './pageToolsSupport/types';

const fixtures = vi.hoisted(() => {
  const checkPermission = vi.fn();
  const getEffectiveTabId = vi.fn();
  const createChildTabInGroup = vi.fn();
  const getValidTabsWithMetadata = vi.fn();
  const clearWindowOpenEvents = vi.fn();
  const enablePageEvents = vi.fn();
  const consumeWindowOpenEvents = vi.fn();
  const sendCommand = vi.fn();
  const checkDomainCategoryForNavigation = vi.fn();

  return {
    checkPermission,
    getEffectiveTabId,
    createChildTabInGroup,
    getValidTabsWithMetadata,
    clearWindowOpenEvents,
    enablePageEvents,
    consumeWindowOpenEvents,
    sendCommand,
    checkDomainCategoryForNavigation
  };
});

vi.mock('../extensionServices', () => ({
  PermissionActionType: {
    READ_PAGE_CONTENT: 'read_page_content',
    CLICK: 'click',
    TYPE: 'type'
  }
}));

vi.mock('./shared', () => ({
  PermissionTools: {
    TYPE: 'type',
    NAVIGATE: 'navigate'
  },
  checkUrlSecurity: vi.fn(async () => null),
  screenshotContextManager: {
    getLastScreenshot: vi.fn()
  },
  waitForTabLoading: vi.fn()
}));

vi.mock('./tabState', () => ({
  tabGroupManager: {
    getEffectiveTabId: fixtures.getEffectiveTabId,
    createChildTabInGroup: fixtures.createChildTabInGroup,
    getValidTabsWithMetadata: fixtures.getValidTabsWithMetadata
  }
}));

vi.mock('./cdp', () => ({
  cdpDebugger: {
    clearWindowOpenEvents: fixtures.clearWindowOpenEvents,
    enablePageEvents: fixtures.enablePageEvents,
    consumeWindowOpenEvents: fixtures.consumeWindowOpenEvents,
    sendCommand: fixtures.sendCommand
  },
  checkDomainSecurity: vi.fn(),
  generateUniqueId: vi.fn(() => 'id-1'),
  screenshotToViewportCoords: vi.fn(),
  scrollViaContentScript: vi.fn()
}));

vi.mock('./refBridge', () => ({
  resolveStaleRef: vi.fn(),
  getRefBackendNodeId: vi.fn(() => null),
  getRefRole: vi.fn(() => null),
  getRefMetaByTab: vi.fn()
}));

vi.mock('./annotatedScreenshot', () => ({
  captureAnnotatedScreenshot: vi.fn()
}));

vi.mock('./navigationIsolation', () => ({
  moveSearchNavigationToNewTab: vi.fn(async () => []),
  checkDomainCategoryForNavigation: fixtures.checkDomainCategoryForNavigation
}));

const chromeMock = vi.hoisted(() => ({
  tabs: {
    get: vi.fn()
  },
  scripting: {
    executeScript: vi.fn()
  }
}));

vi.stubGlobal('chrome', chromeMock);

const { computerTool } = await import('./inputTools');

const context: ToolContext = {
  tabId: 10,
  toolUseId: 'tool-use-1',
  permissionManager: {
    checkPermission: fixtures.checkPermission
  } as unknown as ToolContext['permissionManager']
};

beforeEach(() => {
  fixtures.checkPermission.mockReset();
  fixtures.getEffectiveTabId.mockReset();
  fixtures.createChildTabInGroup.mockReset();
  fixtures.getValidTabsWithMetadata.mockReset();
  fixtures.clearWindowOpenEvents.mockReset();
  fixtures.enablePageEvents.mockReset();
  fixtures.consumeWindowOpenEvents.mockReset();
  fixtures.sendCommand.mockReset();
  fixtures.checkDomainCategoryForNavigation.mockReset();
  chromeMock.tabs.get.mockReset();
  chromeMock.scripting.executeScript.mockReset();

  fixtures.checkDomainCategoryForNavigation.mockResolvedValue(null);
  fixtures.checkPermission.mockResolvedValue({ allowed: true });
  fixtures.getEffectiveTabId.mockResolvedValue(10);
  fixtures.createChildTabInGroup.mockResolvedValue(31);
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
    url: 'https://example.com/'
  });
  chromeMock.scripting.executeScript.mockResolvedValue([
    {
      result: {
        url: 'https://example.com/search?q=agent',
        value: 'agent'
      }
    }
  ]);
});

describe('computer search submit isolation', () => {
  it('opens focused site search submit in a new group tab instead of pressing Enter in the source tab', async () => {
    const result = await computerTool.execute({ action: 'key', text: 'Enter', tabId: 10 }, context);

    expect(fixtures.createChildTabInGroup).toHaveBeenCalledWith(
      10,
      'https://example.com/search?q=agent'
    );
    expect(fixtures.sendCommand).not.toHaveBeenCalled();
    expect(result.output).toContain('Opened search results in a new tab');
    expect(result.tabContext).toMatchObject({
      currentTabId: 10,
      executedOnTabId: 31,
      tabCount: 2
    });
  });

  it('returns permission_required for the synthesized search URL without opening a tab', async () => {
    fixtures.checkPermission.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/search?q=agent') return { allowed: false, needsPrompt: true };
      return { allowed: true };
    });

    const result = await computerTool.execute({ action: 'key', text: 'Enter', tabId: 10 }, context);

    expect(result.type).toBe('permission_required');
    expect(result.tool).toBe('navigate');
    expect(result.url).toBe('https://example.com/search?q=agent');
    expect(fixtures.createChildTabInGroup).not.toHaveBeenCalled();
    expect(fixtures.sendCommand).not.toHaveBeenCalled();
  });

  it('blocks the synthesized search URL when the domain category is restricted', async () => {
    fixtures.checkDomainCategoryForNavigation.mockResolvedValue({
      error: "This site is blocked by your organization's policy."
    });

    const result = await computerTool.execute({ action: 'key', text: 'Enter', tabId: 10 }, context);

    expect(result.error).toBe("This site is blocked by your organization's policy.");
    expect(fixtures.createChildTabInGroup).not.toHaveBeenCalled();
    expect(fixtures.sendCommand).not.toHaveBeenCalled();
  });
});
