import { describe, it, expect, vi } from 'vitest';

const chromeMock = vi.hoisted(() => ({
  tabs: {
    onRemoved: { addListener: vi.fn() }
  }
}));

vi.stubGlobal('chrome', chromeMock);

const { calculateOptimalDimensions, screenshotContextManager } =
  await import('./screenshotContext');

describe('calculateOptimalDimensions', () => {
  const config = { pxPerToken: 32, maxTargetPx: 1024, maxTargetTokens: 1600 };

  it('keeps small images unchanged', () => {
    expect(calculateOptimalDimensions(200, 100, config)).toEqual([200, 100]);
  });

  it('scales down oversized images while preserving aspect ratio', () => {
    const [w, h] = calculateOptimalDimensions(4096, 2048, config);
    expect(w).toBeLessThanOrEqual(config.maxTargetPx);
    expect(h).toBeLessThanOrEqual(config.maxTargetPx);
    expect(Math.abs(w / h - 2)).toBeLessThan(0.05);
  });

  it('handles tall images by transposing internally', () => {
    const [w, h] = calculateOptimalDimensions(2048, 4096, config);
    expect(w).toBeLessThanOrEqual(config.maxTargetPx);
    expect(h).toBeLessThanOrEqual(config.maxTargetPx);
    expect(h).toBeGreaterThan(w);
  });
});

describe('screenshotContextManager', () => {
  it('stores and retrieves contexts only when viewport info is provided', () => {
    screenshotContextManager.clearAllContexts();

    screenshotContextManager.setContext(1, {
      viewportWidth: 800,
      viewportHeight: 600,
      width: 1600,
      height: 1200
    });
    expect(screenshotContextManager.getContext(1)).toEqual({
      viewportWidth: 800,
      viewportHeight: 600,
      screenshotWidth: 1600,
      screenshotHeight: 1200
    });

    screenshotContextManager.setContext(2, { width: 100, height: 100 });
    expect(screenshotContextManager.getContext(2)).toBeUndefined();
  });

  it('clears individual and all contexts', () => {
    screenshotContextManager.clearAllContexts();
    screenshotContextManager.setContext(1, {
      viewportWidth: 1,
      viewportHeight: 1,
      width: 2,
      height: 2
    });
    screenshotContextManager.setContext(2, {
      viewportWidth: 1,
      viewportHeight: 1,
      width: 2,
      height: 2
    });

    screenshotContextManager.clearContext(1);
    expect(screenshotContextManager.getContext(1)).toBeUndefined();
    expect(screenshotContextManager.getContext(2)).toBeDefined();

    screenshotContextManager.clearAllContexts();
    expect(screenshotContextManager.getContext(2)).toBeUndefined();
  });
});
