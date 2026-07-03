import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InMemoryDebugStore } from '../debug/store';

describe('cdpDebugger debug instrumentation', () => {
  let store: InMemoryDebugStore;
  let eventHandler:
    | ((source: chrome.debugger.Debuggee, method: string, params: unknown) => void)
    | undefined;
  let detachListeners: Array<(source: chrome.debugger.Debuggee, reason: string) => void>;
  let attachImpl: ReturnType<typeof vi.fn>;
  let sendCommandImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as Record<string, unknown>).__cdpDebuggerListenerRegistered;
    delete (globalThis as Record<string, unknown>).__cdpDebuggerEventHandler;
    delete (globalThis as Record<string, unknown>).__cdpWindowOpenEventsByTab;
    detachListeners = [];
    attachImpl = vi.fn((_t: unknown, _v: string, cb: () => void) => cb());
    sendCommandImpl = vi.fn((_t: unknown, _m: string, _p: unknown, cb: (r: unknown) => void) =>
      cb({})
    );
    vi.stubGlobal('chrome', {
      runtime: { lastError: undefined as unknown, sendMessage: vi.fn(() => Promise.resolve()) },
      tabs: {
        onRemoved: { addListener: vi.fn() },
        sendMessage: vi.fn(() => Promise.resolve())
      },
      debugger: {
        getTargets: vi.fn((cb: (t: chrome.debugger.TargetInfo[]) => void) => cb([])),
        attach: attachImpl,
        detach: vi.fn((_t: unknown, cb: () => void) => cb()),
        sendCommand: sendCommandImpl,
        onEvent: {
          addListener: vi.fn((h: (s: chrome.debugger.Debuggee, m: string, p: unknown) => void) => {
            eventHandler = h;
          })
        },
        onDetach: {
          addListener: vi.fn((h: (s: chrome.debugger.Debuggee, r: string) => void) => {
            detachListeners.push(h);
          })
        }
      }
    });
  });

  afterEach(async () => {
    const { resetDebugRecorder } = await import('@/debug/recorder');
    resetDebugRecorder();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>).__cdpDebuggerListenerRegistered;
    delete (globalThis as Record<string, unknown>).__cdpDebuggerEventHandler;
    delete (globalThis as Record<string, unknown>).__cdpWindowOpenEventsByTab;
  });

  async function setup() {
    const { InMemoryDebugStore } = await import('@/debug/store');
    const { startDebugSession } = await import('@/debug/recorder');
    const { cdpDebugger } = await import('./cdp');
    store = new InMemoryDebugStore();
    await startDebugSession({ store });
    return { cdpDebugger };
  }

  async function cdpEvents() {
    const evts = await store.getEvents();
    return evts.filter((e) => e.domain === 'cdp');
  }

  it('records cdp.attach.start/end on successful attach', async () => {
    const { cdpDebugger } = await setup();
    await cdpDebugger.attachDebugger(1);

    const events = await cdpEvents();
    const names = events.map((e) => e.event);
    expect(names).toContain('cdp.attach.start');
    expect(names).toContain('cdp.attach.end');
    const end = events.find((e) => e.event === 'cdp.attach.end')!;
    expect(end.data?.success).toBe(true);
  });

  it('records cdp.attach.end error on attach failure', async () => {
    attachImpl.mockImplementation((_t: unknown, _v: string, cb: () => void) => {
      (
        globalThis as { chrome: { runtime: { lastError: { message: string } } } }
      ).chrome.runtime.lastError = {
        message: 'cannot attach'
      };
      cb();
    });
    const { cdpDebugger } = await setup();
    await expect(cdpDebugger.attachDebugger(2)).rejects.toThrow('cannot attach');

    const events = await cdpEvents();
    const end = events.find((e) => e.event === 'cdp.attach.end');
    expect(end).toBeDefined();
    expect(end?.level).toBe('error');
    expect(end?.data?.success).toBe(false);
  });

  it('records cdp.detach on explicit detach', async () => {
    const { cdpDebugger } = await setup();
    await cdpDebugger.detachDebugger(3);

    const events = await cdpEvents();
    const detach = events.find((e) => e.event === 'cdp.detach');
    expect(detach).toBeDefined();
    expect(detach?.data?.source).toBe('explicit');
  });

  it('records cdp.detach with reason on chrome-initiated detach', async () => {
    const { cdpDebugger } = await setup();
    await cdpDebugger.attachDebugger(1).catch(() => {});

    for (const listener of detachListeners) {
      listener({ tabId: 9 }, 'canceled_by_user');
    }

    const events = await cdpEvents();
    const detach = events.find((e) => e.event === 'cdp.detach' && e.data?.source === 'chrome');
    expect(detach).toBeDefined();
    expect(detach?.data?.reason).toBe('canceled_by_user');
  });

  it('records cdp.command.error when sendCommand fails', async () => {
    sendCommandImpl.mockImplementation(
      (_t: unknown, _m: string, _p: unknown, cb: (r: unknown) => void) => {
        (
          globalThis as { chrome: { runtime: { lastError: { message: string } } } }
        ).chrome.runtime.lastError = {
          message: 'some CDP failure'
        };
        cb(undefined);
      }
    );
    const { cdpDebugger } = await setup();
    await cdpDebugger.attachDebugger(1).catch(() => {});

    await expect(cdpDebugger.sendCommand(1, 'Page.reload')).rejects.toThrow('some CDP failure');

    const events = await cdpEvents();
    const cmdError = events.find(
      (e) => e.event === 'cdp.command.error' && e.data?.method === 'Page.reload'
    );
    expect(cmdError).toBeDefined();
    expect(cmdError?.data?.willRetry).toBe(false);
  });

  it('records cdp.exception on Runtime.exceptionThrown', async () => {
    const { cdpDebugger } = await setup();
    await cdpDebugger.attachDebugger(1).catch(() => {});

    eventHandler?.({ tabId: 1 }, 'Runtime.exceptionThrown', {
      exceptionDetails: {
        exception: { description: 'ReferenceError: x is not defined' },
        url: 'https://app.test/script.js?token=1',
        lineNumber: 12,
        columnNumber: 3
      }
    });

    const events = await cdpEvents();
    const exc = events.find((e) => e.event === 'cdp.exception');
    expect(exc).toBeDefined();
    expect(exc?.level).toBe('error');
    expect(exc?.data?.text).toContain('ReferenceError');
    expect(exc?.data?.sourceUrl).toBe('https://app.test/script.js?[redacted-query]');
  });

  it('records cdp.window_open with redacted url on Page.windowOpen', async () => {
    const { cdpDebugger } = await setup();
    await cdpDebugger.attachDebugger(1).catch(() => {});

    eventHandler?.({ tabId: 1 }, 'Page.windowOpen', {
      url: 'https://popup.test/open?session=secret',
      userGesture: true
    });

    const events = await cdpEvents();
    const wo = events.find((e) => e.event === 'cdp.window_open');
    expect(wo).toBeDefined();
    expect(wo?.data?.targetUrl).toBe('https://popup.test/open?[redacted-query]');
    expect(wo?.data?.userGesture).toBe(true);
  });

  it('does not record cdp events when debug is disabled', async () => {
    const { InMemoryDebugStore } = await import('@/debug/store');
    const { cdpDebugger } = await import('./cdp');
    store = new InMemoryDebugStore();
    await cdpDebugger.attachDebugger(1).catch(() => {});
    const events = await cdpEvents();
    expect(events).toHaveLength(0);
  });
});
