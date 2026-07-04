import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tabLeaseMock = vi.hoisted(() => ({
  assertTabAvailableForSession: vi.fn(),
  claimTab: vi.fn(),
  getLease: vi.fn()
}));

vi.mock('./cdp', () => ({
  cdpDebugger: {
    sendCommand: vi.fn()
  }
}));

vi.mock('./tabState/tabLeases', () => ({
  tabLeaseManager: tabLeaseMock
}));

import {
  superduckActiveContextTool,
  superduckDownloadsTool,
  superduckHistoryTool,
  superduckListTabsTool
} from './superduckTools';

describe('superduckListTabsTool', () => {
  const tabsQuery = vi.fn();
  const tabsGet = vi.fn();
  const downloadsSearch = vi.fn();
  const historySearch = vi.fn();
  const getLastFocused = vi.fn();
  const executeScript = vi.fn();

  const scopedContext = (sessionId: string) => ({ browserSessionScope: { sessionId } }) as never;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    tabLeaseMock.assertTabAvailableForSession.mockResolvedValue(undefined);
    tabLeaseMock.claimTab.mockResolvedValue(undefined);
    tabLeaseMock.getLease.mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      tabs: {
        get: tabsGet,
        query: tabsQuery
      },
      windows: {
        getLastFocused
      },
      downloads: {
        search: downloadsSearch
      },
      history: {
        search: historySearch
      },
      scripting: {
        executeScript
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

  it('filters tabs leased by another browser session', async () => {
    tabsQuery.mockResolvedValue([
      { id: 1, windowId: 10, url: 'https://free.test', title: 'Free', active: true },
      { id: 2, windowId: 10, url: 'https://owned.test', title: 'Owned', active: false },
      { id: 3, windowId: 11, url: 'https://mine.test', title: 'Mine', active: false }
    ]);
    getLastFocused.mockResolvedValue({ id: 10 });
    tabLeaseMock.getLease.mockImplementation(async (tabId: number) => {
      if (tabId === 2) return { tabId, sessionId: 'session-a', origin: 'agent' };
      if (tabId === 3) return { tabId, sessionId: 'session-b', origin: 'agent' };
      return undefined;
    });

    const result = await superduckListTabsTool.execute({}, scopedContext('session-b'));

    expect(result.error).toBeUndefined();
    expect(JSON.parse(result.output ?? '')).toEqual({
      activeWindowId: 10,
      tabs: [
        {
          id: 1,
          windowId: 10,
          url: 'https://free.test',
          title: 'Free',
          active: true,
          focusedWindow: true
        },
        {
          id: 3,
          windowId: 11,
          url: 'https://mine.test',
          title: 'Mine',
          active: false,
          focusedWindow: false
        }
      ]
    });
  });

  it('rejects an explicit tabId leased by another browser session', async () => {
    tabsGet.mockResolvedValue({
      id: 2,
      windowId: 10,
      url: 'https://owned.test',
      title: 'Owned',
      active: false
    });
    tabLeaseMock.assertTabAvailableForSession.mockRejectedValueOnce(
      new Error('Tab 2 is already part of browser session session-a')
    );

    const result = await superduckActiveContextTool.execute(
      { tabId: 2 },
      scopedContext('session-b')
    );

    expect(result).toEqual({
      error: 'superduck_active_context failed: Tab 2 is already part of browser session session-a'
    });
    expect(tabLeaseMock.assertTabAvailableForSession).toHaveBeenCalledWith('session-b', 2);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('rejects the implicit active tab when it is leased by another browser session', async () => {
    getLastFocused.mockResolvedValue({ id: 10 });
    tabsQuery.mockResolvedValue([
      {
        id: 4,
        windowId: 10,
        url: 'https://active-owned.test',
        title: 'Active owned',
        active: true
      }
    ]);
    tabLeaseMock.assertTabAvailableForSession.mockRejectedValueOnce(
      new Error('Tab 4 is already part of browser session session-a')
    );

    const result = await superduckActiveContextTool.execute({}, scopedContext('session-b'));

    expect(result).toEqual({
      error: 'superduck_active_context failed: Tab 4 is already part of browser session session-a'
    });
    expect(tabLeaseMock.assertTabAvailableForSession).toHaveBeenCalledWith('session-b', 4);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('blocks global downloads and history in scoped browser sessions', async () => {
    await expect(
      superduckDownloadsTool.execute({}, scopedContext('session-b'))
    ).resolves.toMatchObject({
      error:
        'superduck_downloads is unavailable for scoped browser sessions because Chrome downloads are global browser history.'
    });
    await expect(
      superduckHistoryTool.execute({}, scopedContext('session-b'))
    ).resolves.toMatchObject({
      error:
        'superduck_history is unavailable for scoped browser sessions because Chrome history is global browser history.'
    });
    expect(downloadsSearch).not.toHaveBeenCalled();
    expect(historySearch).not.toHaveBeenCalled();
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
