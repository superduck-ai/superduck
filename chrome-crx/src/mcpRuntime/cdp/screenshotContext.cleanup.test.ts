import { describe, it, expect, vi } from 'vitest';

const mockAddListener = vi.fn();
const mockChrome = {
  tabs: {
    onRemoved: {
      addListener: mockAddListener
    },
    get: vi.fn()
  }
};

vi.stubGlobal('chrome', mockChrome);

const { screenshotContextManager } = await import('./screenshotContext');

describe('screenshotContextManager tab cleanup', () => {
  it('registers a listener on module load to clean up screenshot context', () => {
    expect(mockAddListener).toHaveBeenCalledTimes(1);
    expect(mockAddListener).toHaveBeenCalledWith(expect.any(Function));
  });

  it('clears screenshot context when a tab is removed', () => {
    screenshotContextManager.clearAllContexts();
    screenshotContextManager.setContext(42, {
      viewportWidth: 800,
      viewportHeight: 600,
      width: 1600,
      height: 1200
    });

    expect(screenshotContextManager.getContext(42)).toBeDefined();

    const listener = mockAddListener.mock.calls[0][0];
    listener(42);

    expect(screenshotContextManager.getContext(42)).toBeUndefined();
  });

  it('does not affect other tabs when one is removed', () => {
    screenshotContextManager.clearAllContexts();
    screenshotContextManager.setContext(1, {
      viewportWidth: 800,
      viewportHeight: 600,
      width: 1600,
      height: 1200
    });
    screenshotContextManager.setContext(2, {
      viewportWidth: 1024,
      viewportHeight: 768,
      width: 2048,
      height: 1536
    });

    const listener = mockAddListener.mock.calls[0][0];
    listener(1);

    expect(screenshotContextManager.getContext(1)).toBeUndefined();
    expect(screenshotContextManager.getContext(2)).toBeDefined();
  });
});
