interface ScreenshotDimensionConfig {
  pxPerToken: number;
  maxTargetPx: number;
  maxTargetTokens: number;
}

export interface ScreenshotContext {
  viewportWidth: number;
  viewportHeight: number;
  screenshotWidth: number;
  screenshotHeight: number;
}

function calculateTileCount(pixels: number, pxPerToken: number): number {
  return Math.floor((pixels - 1) / pxPerToken) + 1;
}

function calculateTokenCount(width: number, height: number, pxPerToken: number): number {
  return calculateTileCount(width, pxPerToken) * calculateTileCount(height, pxPerToken);
}

export function calculateOptimalDimensions(
  width: number,
  height: number,
  config: ScreenshotDimensionConfig
): [number, number] {
  const { pxPerToken, maxTargetPx, maxTargetTokens } = config;
  if (
    width <= maxTargetPx &&
    height <= maxTargetPx &&
    calculateTokenCount(width, height, pxPerToken) <= maxTargetTokens
  )
    return [width, height];
  if (height > width) {
    const [h, w] = calculateOptimalDimensions(height, width, config);
    return [w, h];
  }
  const aspectRatio = width / height;
  let upper = width;
  let lower = 1;
  for (;;) {
    if (lower + 1 === upper) return [lower, Math.max(Math.round(lower / aspectRatio), 1)];
    const midWidth = Math.floor((lower + upper) / 2);
    const midHeight = Math.max(Math.round(midWidth / aspectRatio), 1);
    if (
      midWidth <= maxTargetPx &&
      calculateTokenCount(midWidth, midHeight, pxPerToken) <= maxTargetTokens
    )
      lower = midWidth;
    else upper = midWidth;
  }
}

export const screenshotContextManager = new (class {
  contexts = new Map<number, ScreenshotContext>();

  setContext(
    tabId: number,
    info: {
      viewportWidth?: number;
      viewportHeight?: number;
      width: number;
      height: number;
    }
  ) {
    if (info.viewportWidth && info.viewportHeight) {
      const ctx = {
        viewportWidth: info.viewportWidth,
        viewportHeight: info.viewportHeight,
        screenshotWidth: info.width,
        screenshotHeight: info.height
      };
      this.contexts.set(tabId, ctx);
      console.info(
        `[ScreenshotContext] tab=${tabId} set vp=${ctx.viewportWidth}x${ctx.viewportHeight} ` +
          `ss=${ctx.screenshotWidth}x${ctx.screenshotHeight} ` +
          `scaleX=${(ctx.viewportWidth / ctx.screenshotWidth).toFixed(4)} ` +
          `scaleY=${(ctx.viewportHeight / ctx.screenshotHeight).toFixed(4)}`
      );
    }
  }

  getContext(tabId: number) {
    return this.contexts.get(tabId);
  }

  clearContext(tabId: number) {
    this.contexts.delete(tabId);
  }

  clearAllContexts() {
    this.contexts.clear();
  }
})();

// Clean up screenshot context when tabs are closed.
// Without this, the Map grows unboundedly for the service worker lifetime.
// Stale contexts for closed tabs would also produce incorrect coordinate
// mappings if Chrome reuses tab IDs.
if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    screenshotContextManager.clearContext(tabId);
  });
}
