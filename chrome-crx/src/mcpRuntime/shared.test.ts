import { describe, it, expect } from 'vitest';
import {
  calculateOptimalDimensions,
  checkUrlSecurity,
  extractAppName,
  formatTabsOutput,
  normalizeUrl,
  screenshotContextManager
} from './shared';

describe('normalizeUrl', () => {
  it('keeps http URLs unchanged', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('keeps https URLs unchanged', () => {
    expect(normalizeUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
  });

  it('prefixes bare hostnames with https://', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com');
    expect(normalizeUrl('foo.bar/baz')).toBe('https://foo.bar/baz');
  });
});

describe('extractAppName', () => {
  it('returns the second-level domain for normal hosts', () => {
    expect(extractAppName('https://www.google.com/search')).toBe('google');
    expect(extractAppName('https://app.example.co/path')).toBe('example');
  });

  it('returns the hostname when it has fewer than two parts', () => {
    expect(extractAppName('http://localhost:3000')).toBe('localhost');
  });

  it('returns undefined for invalid URLs', () => {
    expect(extractAppName('not a url')).toBeUndefined();
  });
});

describe('formatTabsOutput', () => {
  it('returns a placeholder when no tabs are provided', () => {
    expect(formatTabsOutput([])).toBe('No tabs available.');
    expect(formatTabsOutput(null)).toBe('No tabs available.');
  });

  it('formats a list of tabs and marks the active one', () => {
    const tabs = [
      { id: 1, title: 'A', url: 'https://a.com' },
      { id: 2, title: 'B', url: 'https://b.com' }
    ];
    const out = formatTabsOutput(tabs, 42, 2);
    expect(out).toContain('Tab Group 42:');
    expect(out).toContain('- tabId 1: "A" (https://a.com)');
    expect(out).toContain('- tabId 2: "B" (https://b.com) (active)');
  });

  it('falls back to "unknown" group when none is supplied', () => {
    const out = formatTabsOutput([{ id: 1, title: 'x', url: 'https://x' }]);
    expect(out.startsWith('Tab Group unknown:')).toBe(true);
  });
});

describe('checkUrlSecurity', () => {
  it.each(['chrome:', 'chrome-extension:', 'about:', 'data:', 'javascript:'])(
    'blocks %s URLs',
    async (proto) => {
      const result = await checkUrlSecurity(1, `${proto}//foo`, 'navigate');
      expect(result).toEqual({ error: `Cannot perform navigate on ${proto} URLs` });
    }
  );

  it('returns null for safe http/https URLs', async () => {
    expect(await checkUrlSecurity(1, 'https://example.com', 'navigate')).toBeNull();
    expect(await checkUrlSecurity(1, 'http://example.com', 'navigate')).toBeNull();
  });
});

describe('calculateOptimalDimensions', () => {
  const config = { pxPerToken: 32, maxTargetPx: 1024, maxTargetTokens: 1600 };

  it('keeps small images unchanged', () => {
    expect(calculateOptimalDimensions(200, 100, config)).toEqual([200, 100]);
  });

  it('scales down oversized images while preserving aspect ratio', () => {
    const [w, h] = calculateOptimalDimensions(4096, 2048, config);
    expect(w).toBeLessThanOrEqual(config.maxTargetPx);
    expect(h).toBeLessThanOrEqual(config.maxTargetPx);
    // aspect ratio ~ 2:1 preserved (within rounding)
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

    // Missing viewport info → not stored
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
