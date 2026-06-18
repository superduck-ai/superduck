import { afterEach, describe, expect, it, vi } from 'vitest';

describe('cdpDebugger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
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
});
