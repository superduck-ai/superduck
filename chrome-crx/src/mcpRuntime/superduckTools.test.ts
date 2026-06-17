import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./cdp', () => ({
  cdpDebugger: {
    sendCommand: vi.fn()
  }
}));

import { superduckListTabsTool } from './superduckTools';

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
