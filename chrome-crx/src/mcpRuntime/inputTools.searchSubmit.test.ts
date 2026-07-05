import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from './pageToolsSupport/types';

const fixtures = vi.hoisted(() => {
  const checkPermission = vi.fn();
  const resolveTabForContext = vi.fn();
  const createChildTabInGroup = vi.fn();
  const getValidTabsWithMetadata = vi.fn();
  const withPreservedActiveTab = vi.fn();
  const adoptChildTabsFromOpener = vi.fn();
  const rememberChildTabNavigationPolicy = vi.fn();
  const clearWindowOpenEvents = vi.fn();
  const enablePageEvents = vi.fn();
  const consumeWindowOpenEvents = vi.fn();
  const sendCommand = vi.fn();
  const getKeyCode = vi.fn();
  const pressKey = vi.fn();
  const click = vi.fn();
  const screenshot = vi.fn();
  const moveSearchNavigationToNewTab = vi.fn();
  const filterPolicyAllowedTabs = vi.fn();
  const awaitOpenerChildTabId = vi.fn();
  const createPolicyCheckedChildTab = vi.fn();
  const closeTabIfPresent = vi.fn();

  return {
    checkPermission,
    resolveTabForContext,
    createChildTabInGroup,
    getValidTabsWithMetadata,
    withPreservedActiveTab,
    adoptChildTabsFromOpener,
    rememberChildTabNavigationPolicy,
    clearWindowOpenEvents,
    enablePageEvents,
    consumeWindowOpenEvents,
    sendCommand,
    getKeyCode,
    pressKey,
    click,
    screenshot,
    moveSearchNavigationToNewTab,
    filterPolicyAllowedTabs,
    awaitOpenerChildTabId,
    createPolicyCheckedChildTab,
    closeTabIfPresent
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
    getLastScreenshot: vi.fn(),
    getContext: vi.fn(() => null)
  },
  waitForTabLoading: vi.fn()
}));

vi.mock('./tabState', () => ({
  tabGroupManager: {
    resolveTabForContext: fixtures.resolveTabForContext,
    createChildTabInGroup: fixtures.createChildTabInGroup,
    getValidTabsWithMetadata: fixtures.getValidTabsWithMetadata,
    getValidTabsWithMetadataForContext: fixtures.getValidTabsWithMetadata,
    withPreservedActiveTab: fixtures.withPreservedActiveTab,
    adoptChildTabsFromOpener: fixtures.adoptChildTabsFromOpener,
    rememberChildTabNavigationPolicy: fixtures.rememberChildTabNavigationPolicy,
    awaitOpenerChildTabId: fixtures.awaitOpenerChildTabId
  }
}));

vi.mock('./tabState/tabLeases', () => ({
  BrowserSessionConflictError: class BrowserSessionConflictError extends Error {
    readonly code = 'browser_session_conflict';

    constructor(
      readonly tabId: number,
      readonly owningSessionId: string
    ) {
      super(`Tab ${tabId} is already part of browser session ${owningSessionId}`);
      this.name = 'BrowserSessionConflictError';
    }
  }
}));

vi.mock('./cdp', () => ({
  cdpDebugger: {
    clearWindowOpenEvents: fixtures.clearWindowOpenEvents,
    enablePageEvents: fixtures.enablePageEvents,
    consumeWindowOpenEvents: fixtures.consumeWindowOpenEvents,
    sendCommand: fixtures.sendCommand,
    getKeyCode: fixtures.getKeyCode,
    pressKey: fixtures.pressKey,
    click: fixtures.click,
    screenshot: fixtures.screenshot
  },
  checkDomainSecurity: vi.fn(async () => null),
  generateUniqueId: vi.fn(() => 'id-1'),
  screenshotToViewportCoords: vi.fn(),
  mapCoordinateToViewport: vi.fn((x: number, y: number) => [x, y]),
  scrollViaContentScript: vi.fn(),
  screenshotContextManager: {
    getLastScreenshot: vi.fn(),
    getContext: vi.fn(() => null)
  }
}));

vi.mock('./screenshot/refBridge', () => ({
  resolveStaleRef: vi.fn(),
  getRefBackendNodeId: vi.fn(() => null),
  getRefRole: vi.fn(() => null),
  getRefMetaByTab: vi.fn()
}));

vi.mock('./screenshot/annotatedScreenshot', () => ({
  captureAnnotatedScreenshot: vi.fn()
}));

vi.mock('./navigationIsolation', () => ({
  moveSearchNavigationToNewTab: fixtures.moveSearchNavigationToNewTab,
  checkDomainCategoryForNavigation: vi.fn(async () => null),
  createPolicyCheckedChildTab: fixtures.createPolicyCheckedChildTab,
  filterPolicyAllowedTabs: fixtures.filterPolicyAllowedTabs,
  closeTabIfPresent: fixtures.closeTabIfPresent
}));

const chromeMock = vi.hoisted(() => ({
  tabs: {
    get: vi.fn(),
    query: vi.fn(),
    remove: vi.fn()
  },
  scripting: {
    executeScript: vi.fn()
  }
}));

vi.stubGlobal('chrome', chromeMock);

const { computerTool } = await import('./inputTools/computerTool');
const { BrowserSessionConflictError } = await import('./tabState/tabLeases');

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

function expectPreActionSnapshotFilter(value: unknown): void {
  const filter = value as { ignoreExistingTabIds?: Set<number>; windowId?: number };
  expect(filter.windowId).toBe(1);
  expect(filter.ignoreExistingTabIds).toBeInstanceOf(Set);
  expect(filter.ignoreExistingTabIds?.has(10)).toBe(true);
}

beforeEach(() => {
  for (const fn of Object.values(fixtures)) fn.mockReset();
  chromeMock.tabs.get.mockReset();
  chromeMock.tabs.query.mockReset();
  chromeMock.tabs.remove.mockReset();
  chromeMock.scripting.executeScript.mockReset();

  fixtures.checkPermission.mockResolvedValue({ allowed: true });
  fixtures.resolveTabForContext.mockResolvedValue(10);
  fixtures.withPreservedActiveTab.mockImplementation(
    async (_tabId: number, action: () => Promise<unknown>) => action()
  );
  fixtures.adoptChildTabsFromOpener.mockResolvedValue([]);
  fixtures.filterPolicyAllowedTabs.mockImplementation(async (tabIds: number[]) => tabIds);
  fixtures.consumeWindowOpenEvents.mockReturnValue([]);
  fixtures.moveSearchNavigationToNewTab.mockResolvedValue([]);
  fixtures.awaitOpenerChildTabId.mockResolvedValue(undefined);
  fixtures.createPolicyCheckedChildTab.mockResolvedValue(null);
  fixtures.closeTabIfPresent.mockImplementation(async (tabId: number) => {
    await chromeMock.tabs.remove(tabId);
  });
  fixtures.getKeyCode.mockReturnValue('Enter');
  fixtures.click.mockResolvedValue(undefined);
  fixtures.screenshot.mockResolvedValue({
    base64: 'abc',
    format: 'png',
    width: 800,
    height: 600
  });
  fixtures.getValidTabsWithMetadata.mockResolvedValue([
    { id: 10, title: 'Source', url: 'https://example.com/' },
    { id: 31, title: 'Results', url: 'https://example.com/search?q=agent' }
  ]);
  chromeMock.tabs.get.mockResolvedValue({ id: 10, windowId: 1, url: 'https://example.com/' });
  chromeMock.tabs.query.mockResolvedValue([{ id: 10, windowId: 1, url: 'https://example.com/' }]);
  chromeMock.tabs.remove.mockResolvedValue(undefined);
});

describe('computer search submit isolation (post-action)', () => {
  it('runs the real key action and isolates the resulting in-place search navigation', async () => {
    fixtures.moveSearchNavigationToNewTab.mockResolvedValue([31]);

    const result = await computerTool.execute({ action: 'key', text: 'Enter', tabId: 10 }, context);

    // The real Enter must be dispatched (so SPA/onsubmit handlers and the typed
    // value drive the navigation), then the in-place result is moved to a new tab.
    expect(fixtures.rememberChildTabNavigationPolicy).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        permissionManager: context.permissionManager,
        toolName: 'computer'
      })
    );
    expect(fixtures.pressKey).toHaveBeenCalledWith(10, 'Enter');
    expect(fixtures.moveSearchNavigationToNewTab).toHaveBeenCalledWith(
      expect.objectContaining({ openerTabId: 10, previousUrl: 'https://example.com/' })
    );
    expect(result.output).toContain('Opened new tab');
    expect(result.tabContext).toMatchObject({
      currentTabId: 10,
      executedOnTabId: 31,
      tabCount: 2
    });
  });

  it('reports a policy-allowed adopted tab opened by the interaction', async () => {
    fixtures.adoptChildTabsFromOpener.mockResolvedValue([41]);
    fixtures.filterPolicyAllowedTabs.mockResolvedValue([41]);

    const result = await computerTool.execute({ action: 'key', text: 'Enter', tabId: 10 }, context);

    expect(fixtures.pressKey).toHaveBeenCalledWith(10, 'Enter');
    expect(fixtures.consumeWindowOpenEvents).toHaveBeenCalledWith(10);
    expect(fixtures.adoptChildTabsFromOpener).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        ignoreExistingTabIds: expect.any(Set),
        windowId: 1
      })
    );
    expectPreActionSnapshotFilter(fixtures.adoptChildTabsFromOpener.mock.calls[0][1]);
    expect(fixtures.moveSearchNavigationToNewTab).toHaveBeenCalledWith(
      expect.objectContaining({ openerTabId: 10, previousUrl: 'https://example.com/' })
    );
    expect(result.tabContext).toMatchObject({ executedOnTabId: 41 });
  });

  it('also isolates same-tab search navigation when the interaction opened a popup', async () => {
    fixtures.adoptChildTabsFromOpener.mockResolvedValue([41]);
    fixtures.filterPolicyAllowedTabs.mockResolvedValue([41]);
    fixtures.moveSearchNavigationToNewTab.mockResolvedValue([31]);

    const result = await computerTool.execute({ action: 'key', text: 'Enter', tabId: 10 }, context);

    expect(fixtures.pressKey).toHaveBeenCalledWith(10, 'Enter');
    expect(fixtures.consumeWindowOpenEvents).toHaveBeenCalledWith(10);
    expect(fixtures.moveSearchNavigationToNewTab).toHaveBeenCalledWith(
      expect.objectContaining({ openerTabId: 10, previousUrl: 'https://example.com/' })
    );
    expect(result.output).toContain('Opened new tabs in current group: 41, 31');
    expect(result.tabContext).toMatchObject({ executedOnTabId: 31 });
  });

  it('also isolates same-tab search navigation after a submit click', async () => {
    fixtures.moveSearchNavigationToNewTab.mockResolvedValue([31]);

    const result = await computerTool.execute(
      { action: 'left_click', coordinate: [12, 34], tabId: 10 },
      context
    );

    expect(fixtures.click).toHaveBeenCalledWith(10, 12, 34, 'left', 1, 0, undefined);
    expect(fixtures.moveSearchNavigationToNewTab).toHaveBeenCalledWith(
      expect.objectContaining({ openerTabId: 10, previousUrl: 'https://example.com/' })
    );
    expect(result.output).toContain('Opened new tab in current group: 31');
    expect(result.tabContext).toMatchObject({ executedOnTabId: 31 });
  });

  it('drops an adopted tab that the policy filter rejected', async () => {
    fixtures.adoptChildTabsFromOpener.mockResolvedValue([41]);
    fixtures.filterPolicyAllowedTabs.mockResolvedValue([]);

    const result = await computerTool.execute({ action: 'key', text: 'Enter', tabId: 10 }, context);

    // Filtered out -> falls through to the search-move fallback (also empty here),
    // so the action ran on the original tab and no new tab is reported.
    expect(result.tabContext).toMatchObject({ executedOnTabId: 10 });
  });
});

describe('computer window.open fallback (no duplicate popup)', () => {
  it('waits for the real popup before creating a tab from a window.open event', async () => {
    // adoptChildTabsFromOpener missed the popup (timing) but a window.open event
    // was captured. The fallback must wait for the real popup and reuse it via
    // createChildTabInGroup's dedup — never create a second duplicate tab.
    fixtures.adoptChildTabsFromOpener.mockResolvedValue([]);
    fixtures.consumeWindowOpenEvents.mockReturnValue([
      { url: 'https://child.example/', timestamp: 0 }
    ]);
    fixtures.awaitOpenerChildTabId.mockResolvedValue(99);
    fixtures.createPolicyCheckedChildTab.mockResolvedValue(99);

    const result = await computerTool.execute(
      { action: 'left_click', coordinate: [12, 34], tabId: 10 },
      context
    );

    expect(fixtures.awaitOpenerChildTabId).toHaveBeenCalledWith(
      10,
      'https://child.example/',
      expect.any(Number),
      expect.objectContaining({
        ignoreExistingTabIds: expect.any(Set),
        windowId: 1
      })
    );
    expectPreActionSnapshotFilter(fixtures.awaitOpenerChildTabId.mock.calls[0][3]);
    expect(fixtures.createPolicyCheckedChildTab).toHaveBeenCalledTimes(1);
    expect(fixtures.createPolicyCheckedChildTab).toHaveBeenCalledWith(
      10,
      'https://child.example/',
      expect.any(Object),
      expect.objectContaining({
        existingTabId: 99,
        allowUnlinkedExistingTab: false,
        ignoreExistingTabIds: expect.any(Set),
        windowId: 1
      })
    );
    expectPreActionSnapshotFilter(fixtures.createPolicyCheckedChildTab.mock.calls[0][3]);
    expect(result.tabContext).toMatchObject({ executedOnTabId: 99 });
  });

  it('reuses a newly-created still-opening tab even when Chrome does not preserve opener metadata', async () => {
    fixtures.adoptChildTabsFromOpener.mockResolvedValue([]);
    fixtures.consumeWindowOpenEvents.mockReturnValue([
      { url: 'https://www.baidu.com/link?url=abc', timestamp: 0 }
    ]);
    fixtures.awaitOpenerChildTabId.mockResolvedValue(undefined);
    fixtures.createPolicyCheckedChildTab.mockResolvedValue(88);
    chromeMock.tabs.query
      .mockResolvedValueOnce([{ id: 10, windowId: 1, url: 'https://example.com/' }])
      .mockResolvedValue([
        { id: 10, windowId: 1, url: 'https://example.com/' },
        {
          id: 88,
          windowId: 1,
          url: 'about:blank',
          pendingUrl: 'https://www.deepseek.com/',
          status: 'loading',
          lastAccessed: Date.now()
        }
      ]);

    const result = await computerTool.execute(
      { action: 'left_click', coordinate: [12, 34], tabId: 10 },
      context
    );

    expect(fixtures.createPolicyCheckedChildTab).toHaveBeenCalledWith(
      10,
      'https://www.baidu.com/link?url=abc',
      expect.any(Object),
      expect.objectContaining({
        existingTabId: 88,
        allowUnlinkedExistingTab: true,
        ignoreExistingTabIds: expect.any(Set),
        windowId: 1
      })
    );
    expectPreActionSnapshotFilter(fixtures.createPolicyCheckedChildTab.mock.calls[0][3]);
    expect(result.tabContext).toMatchObject({ executedOnTabId: 88 });
  });

  it('does not guess a single unlinked tab that already settled on an unrelated URL', async () => {
    fixtures.adoptChildTabsFromOpener.mockResolvedValue([]);
    fixtures.consumeWindowOpenEvents.mockReturnValue([
      { url: 'https://www.baidu.com/link?url=abc', timestamp: 0 }
    ]);
    fixtures.awaitOpenerChildTabId.mockResolvedValue(undefined);
    fixtures.createPolicyCheckedChildTab.mockResolvedValue(77);
    chromeMock.tabs.query
      .mockResolvedValueOnce([{ id: 10, windowId: 1, url: 'https://example.com/' }])
      .mockResolvedValue([
        { id: 10, windowId: 1, url: 'https://example.com/' },
        {
          id: 88,
          windowId: 1,
          url: 'https://www.deepseek.com/',
          status: 'complete',
          lastAccessed: Date.now()
        }
      ]);

    const result = await computerTool.execute(
      { action: 'left_click', coordinate: [12, 34], tabId: 10 },
      context
    );

    expect(fixtures.createPolicyCheckedChildTab).toHaveBeenCalledTimes(1);
    expect(fixtures.createPolicyCheckedChildTab.mock.calls[0]).toHaveLength(4);
    expectPreActionSnapshotFilter(fixtures.createPolicyCheckedChildTab.mock.calls[0][3]);
    expect(result.tabContext).toMatchObject({ executedOnTabId: 77 });
  });

  it('does not guess an unlinked candidate when multiple new tabs appeared', async () => {
    fixtures.adoptChildTabsFromOpener.mockResolvedValue([]);
    fixtures.consumeWindowOpenEvents.mockReturnValue([
      { url: 'https://www.baidu.com/link?url=abc', timestamp: 0 }
    ]);
    fixtures.awaitOpenerChildTabId.mockResolvedValue(undefined);
    fixtures.createPolicyCheckedChildTab.mockResolvedValue(77);
    chromeMock.tabs.query
      .mockResolvedValueOnce([{ id: 10, windowId: 1, url: 'https://example.com/' }])
      .mockResolvedValue([
        { id: 10, windowId: 1, url: 'https://example.com/' },
        { id: 88, windowId: 1, url: 'https://www.deepseek.com/', status: 'complete' },
        { id: 89, windowId: 1, url: 'about:blank', status: 'loading' }
      ]);

    const result = await computerTool.execute(
      { action: 'left_click', coordinate: [12, 34], tabId: 10 },
      context
    );

    expect(fixtures.createPolicyCheckedChildTab).toHaveBeenCalledTimes(1);
    expect(fixtures.createPolicyCheckedChildTab.mock.calls[0]).toHaveLength(4);
    expect(fixtures.createPolicyCheckedChildTab.mock.calls[0]).toEqual([
      10,
      'https://www.baidu.com/link?url=abc',
      expect.any(Object),
      expect.objectContaining({
        ignoreExistingTabIds: expect.any(Set),
        windowId: 1
      })
    ]);
    expectPreActionSnapshotFilter(fixtures.createPolicyCheckedChildTab.mock.calls[0][3]);
    expect(result.tabContext).toMatchObject({ executedOnTabId: 77 });
  });

  it('creates a tab only when no popup materializes within the wait budget', async () => {
    fixtures.adoptChildTabsFromOpener.mockResolvedValue([]);
    fixtures.consumeWindowOpenEvents.mockReturnValue([
      { url: 'https://child.example/', timestamp: 0 }
    ]);
    fixtures.awaitOpenerChildTabId.mockResolvedValue(undefined);
    fixtures.createPolicyCheckedChildTab.mockResolvedValue(77);

    const result = await computerTool.execute(
      { action: 'left_click', coordinate: [12, 34], tabId: 10 },
      context
    );

    expect(fixtures.awaitOpenerChildTabId).toHaveBeenCalled();
    expect(fixtures.createPolicyCheckedChildTab).toHaveBeenCalledTimes(1);
    expectPreActionSnapshotFilter(fixtures.awaitOpenerChildTabId.mock.calls[0][3]);
    expectPreActionSnapshotFilter(fixtures.createPolicyCheckedChildTab.mock.calls[0][3]);
    expect(result.tabContext).toMatchObject({ executedOnTabId: 77 });
  });

  it('continues processing window.open events after one session conflict', async () => {
    fixtures.adoptChildTabsFromOpener.mockResolvedValue([]);
    fixtures.consumeWindowOpenEvents.mockReturnValue([
      { url: 'https://conflict.example/', timestamp: 0 },
      { url: 'https://child.example/', timestamp: 1 }
    ]);
    fixtures.awaitOpenerChildTabId.mockResolvedValueOnce(98).mockResolvedValueOnce(99);
    fixtures.createPolicyCheckedChildTab
      .mockRejectedValueOnce(new BrowserSessionConflictError(98, 'session-b'))
      .mockResolvedValueOnce(99);

    const result = await computerTool.execute(
      { action: 'left_click', coordinate: [12, 34], tabId: 10 },
      {
        ...context,
        browserSessionScope: { sessionId: 'session-a' }
      }
    );

    expect(fixtures.createPolicyCheckedChildTab).toHaveBeenCalledTimes(2);
    expect(result.output).toContain('Opened new tab in current group: 99');
    expect(result.tabContext).toMatchObject({ executedOnTabId: 99 });
  });

  it('does not close pre-existing tabs with the same URL during orphan cleanup', async () => {
    vi.useFakeTimers();
    try {
      fixtures.adoptChildTabsFromOpener.mockResolvedValue([31]);
      fixtures.filterPolicyAllowedTabs.mockImplementation(async (tabIds: number[]) => tabIds);
      chromeMock.tabs.query
        .mockResolvedValueOnce([
          { id: 10, windowId: 1, url: 'https://example.com/' },
          { id: 20, windowId: 1, url: 'https://target.example/' }
        ])
        .mockResolvedValueOnce([
          { id: 10, windowId: 1, url: 'https://example.com/' },
          { id: 20, windowId: 1, url: 'https://target.example/' },
          { id: 31, windowId: 1, url: 'https://target.example/' },
          { id: 32, windowId: 1, url: 'https://target.example/' }
        ])
        .mockResolvedValueOnce([
          { id: 10, windowId: 1, url: 'https://example.com/' },
          { id: 20, windowId: 1, url: 'https://target.example/' },
          { id: 31, windowId: 1, url: 'https://target.example/' },
          { id: 32, windowId: 1, url: 'https://target.example/' }
        ]);

      const resultPromise = computerTool.execute(
        { action: 'left_click', coordinate: [12, 34], tabId: 10 },
        context
      );
      await vi.advanceTimersByTimeAsync(150);
      const result = await resultPromise;
      await vi.advanceTimersByTimeAsync(1500);
      for (let i = 0; i < 6; i++) await Promise.resolve();

      expect(result.tabContext).toMatchObject({ executedOnTabId: 31 });
      expect(chromeMock.tabs.remove).toHaveBeenCalledTimes(1);
      expect(chromeMock.tabs.remove).toHaveBeenCalledWith(32);
      expect(chromeMock.tabs.remove).not.toHaveBeenCalledWith(20);
    } finally {
      vi.useRealTimers();
    }
  });
});
