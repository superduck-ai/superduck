import { afterEach, describe, expect, it, vi } from 'vitest';

describe('cdpDebugger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>).__cdpDebuggerListenerRegistered;
    delete (globalThis as Record<string, unknown>).__cdpDebuggerEventHandler;
    delete (globalThis as Record<string, unknown>).__cdpWindowOpenEventsByTab;
  });

  it('treats getTargets runtime errors as not attached', async () => {
    const getTargets = vi.fn((callback: (targets?: chrome.debugger.TargetInfo[]) => void) => {
      callback(undefined);
    });

    vi.stubGlobal('chrome', {
      runtime: {
        lastError: { message: 'debugger target unavailable' }
      },
      tabs: {
        onRemoved: {
          addListener: vi.fn()
        }
      },
      debugger: {
        getTargets,
        onEvent: {
          addListener: vi.fn()
        },
        onDetach: {
          addListener: vi.fn()
        }
      }
    });

    const { cdpDebugger } = await import('./cdp');

    await expect(cdpDebugger.isDebuggerAttached(7)).resolves.toBe(false);
  });

  it('records and consumes Page.windowOpen events by tab', async () => {
    let eventHandler:
      | ((source: chrome.debugger.Debuggee, method: string, params: unknown) => void)
      | undefined;

    vi.stubGlobal('chrome', {
      runtime: {},
      tabs: {
        onRemoved: {
          addListener: vi.fn()
        }
      },
      debugger: {
        getTargets: vi.fn(),
        onEvent: {
          addListener: vi.fn(
            (
              handler: (source: chrome.debugger.Debuggee, method: string, params: unknown) => void
            ) => {
              eventHandler = handler;
            }
          )
        },
        onDetach: {
          addListener: vi.fn()
        }
      }
    });

    const { cdpDebugger } = await import('./cdp');
    eventHandler?.({ tabId: 7 }, 'Page.windowOpen', {
      url: 'https://example.com/search?q=agent',
      userGesture: true
    });

    expect(cdpDebugger.consumeWindowOpenEvents(7)).toEqual([
      {
        url: 'https://example.com/search?q=agent',
        timestamp: expect.any(Number),
        windowName: undefined,
        userGesture: true
      }
    ]);
    expect(cdpDebugger.consumeWindowOpenEvents(7)).toEqual([]);
  });
});
