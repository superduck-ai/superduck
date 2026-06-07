import { describe, it, expect, vi } from 'vitest';

// Set up chrome mock BEFORE importing shared.ts to capture the module-level
// listener registration. Use dynamic import to ensure the mock is in place first.
const mockAddListener = vi.fn();
const mockChrome = {
  tabs: {
    onRemoved: {
      addListener: mockAddListener
    },
    get: vi.fn()
  }
};

// Stub chrome globally before module load
vi.stubGlobal('chrome', mockChrome);

// Dynamic import to ensure chrome mock is set up first
const { screenshotContextManager } = await import('./shared');

describe('chrome.tabs.onRemoved listener', () => {
  it('registers a listener on module load to clean up screenshot context', () => {
    // Verify the listener was registered
    expect(mockAddListener).toHaveBeenCalledTimes(1);
    expect(mockAddListener).toHaveBeenCalledWith(expect.any(Function));
  });

  it('clears screenshot context when a tab is removed', () => {
    // Set up some context
    screenshotContextManager.clearAllContexts();
    screenshotContextManager.setContext(42, {
      viewportWidth: 800,
      viewportHeight: 600,
      width: 1600,
      height: 1200
    });

    // Verify context exists
    expect(screenshotContextManager.getContext(42)).toBeDefined();

    // Get the registered listener callback and invoke it
    const listener = mockAddListener.mock.calls[0][0];
    listener(42);

    // Verify context was cleared
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

    // Remove tab 1
    const listener = mockAddListener.mock.calls[0][0];
    listener(1);

    // Tab 1 should be cleared, tab 2 should remain
    expect(screenshotContextManager.getContext(1)).toBeUndefined();
    expect(screenshotContextManager.getContext(2)).toBeDefined();
  });
});
