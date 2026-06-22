import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./cdp', () => ({
  cdpDebugger: {
    sendCommand: vi.fn()
  }
}));

vi.mock('./tabState', () => ({
  tabGroupManager: {
    initialize: vi.fn(),
    getOrCreateMcpTabContext: vi.fn(),
    mcpTabGroupId: null
  }
}));

import { superduckListTabsTool, superduckOpenTool } from './superduckTools';
import { tabGroupManager } from './tabState';

describe('superduckListTabsTool', () => {
  const tabsQuery = vi.fn();
  const getLastFocused = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal('chrome', {
      tabs: {
        query: tabsQuery
      },
      windows: {
        getLastFocused
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns tab data with the focused window marker', async () => {
    tabsQuery.mockResolvedValue([
      { id: 1, windowId: 10, url: 'https://example.com', title: 'Example', active: true },
      { id: 2, windowId: 11, url: 'https://other.test', title: 'Other', active: false }
    ]);
    getLastFocused.mockResolvedValue({ id: 10 });

    const result = await superduckListTabsTool.execute({}, {} as never);

    expect(result.error).toBeUndefined();
    expect(JSON.parse(result.output ?? '')).toEqual({
      activeWindowId: 10,
      tabs: [
        {
          id: 1,
          windowId: 10,
          url: 'https://example.com',
          title: 'Example',
          active: true,
          focusedWindow: true
        },
        {
          id: 2,
          windowId: 11,
          url: 'https://other.test',
          title: 'Other',
          active: false,
          focusedWindow: false
        }
      ]
    });
  });

  it('reports when chrome.tabs.query does not resolve', async () => {
    tabsQuery.mockReturnValue(new Promise(() => undefined));
    getLastFocused.mockResolvedValue({ id: 10 });

    const resultPromise = superduckListTabsTool.execute({}, {} as never);
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(resultPromise).resolves.toEqual({
      error: 'superduck_list_tabs failed: chrome.tabs.query timed out after 5s'
    });
  });

  it('reports when chrome.windows.getLastFocused does not resolve', async () => {
    tabsQuery.mockResolvedValue([]);
    getLastFocused.mockReturnValue(new Promise(() => undefined));

    const resultPromise = superduckListTabsTool.execute({}, {} as never);
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(resultPromise).resolves.toEqual({
      error: 'superduck_list_tabs failed: chrome.windows.getLastFocused timed out after 5s'
    });
  });
});

describe('superduckOpenTool', () => {
  const tabsGet = vi.fn();
  const tabsCreate = vi.fn();
  const tabsUpdate = vi.fn();
  const tabsGroup = vi.fn();
  const initialize = vi.mocked(tabGroupManager.initialize);
  const getMcpContext = vi.mocked(tabGroupManager.getOrCreateMcpTabContext);

  beforeEach(() => {
    vi.clearAllMocks();
    tabGroupManager.mcpTabGroupId = null;
    initialize.mockResolvedValue();
    vi.stubGlobal('chrome', {
      tabs: {
        get: tabsGet,
        create: tabsCreate,
        update: tabsUpdate,
        group: tabsGroup,
        onUpdated: { addListener: vi.fn(), removeListener: vi.fn() }
      },
      tabGroups: {
        TAB_GROUP_ID_NONE: -1
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('navigates MCP tab without active:true (no focus steal)', async () => {
    getMcpContext.mockResolvedValue({
      currentTabId: 42,
      availableTabs: [{ id: 42, title: 'MCP', url: '' }],
      tabCount: 1,
      tabGroupId: 100
    });
    tabsGet.mockResolvedValue({ id: 42, windowId: 5, url: 'https://mcp.test' });
    tabsUpdate.mockResolvedValue({ id: 42, windowId: 5, url: 'https://example.com' });

    const result = await superduckOpenTool.execute({ url: 'https://example.com' }, {} as never);

    expect(result.error).toBeUndefined();
    expect(tabsUpdate).toHaveBeenCalledWith(42, { url: 'https://example.com' });
    // Verify active:true is NOT passed — tab stays in background
    expect(tabsUpdate.mock.calls[0][1]).not.toHaveProperty('active');
  });

  it('creates new tab in MCP group window', async () => {
    getMcpContext.mockResolvedValue({
      currentTabId: 42,
      availableTabs: [{ id: 42, title: 'MCP', url: '' }],
      tabCount: 1,
      tabGroupId: 100
    });
    tabGroupManager.mcpTabGroupId = 100;
    tabsGet.mockResolvedValue({ id: 42, windowId: 5, url: 'https://mcp.test' });
    tabsCreate.mockResolvedValue({ id: 99, windowId: 5, url: 'https://new.test' });
    tabsGroup.mockResolvedValue(100);

    const result = await superduckOpenTool.execute(
      { url: 'https://new.test', newTab: true },
      {} as never
    );

    expect(result.error).toBeUndefined();
    expect(tabsCreate).toHaveBeenCalledWith({
      url: 'https://new.test',
      active: false,
      windowId: 5
    });
    expect(tabsGroup).toHaveBeenCalledWith({ tabIds: [99], groupId: 100 });
  });

  it('uses explicit tabId when provided', async () => {
    tabsGet.mockResolvedValue({ id: 7, windowId: 3, url: 'https://explicit.test' });
    tabsUpdate.mockResolvedValue({ id: 7, windowId: 3, url: 'https://target.test' });

    const result = await superduckOpenTool.execute(
      { url: 'https://target.test', tabId: 7 },
      {} as never
    );

    expect(result.error).toBeUndefined();
    expect(getMcpContext).not.toHaveBeenCalled();
    expect(tabsGet).toHaveBeenCalledWith(7);
  });
});
