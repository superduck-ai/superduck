/**
 * Integration tests for the chrome-crx MCP runtime "navigate + screenshot" flow.
 *
 * These tests don't mock individual functions in isolation — they exercise the
 * combined behavior of multiple modules (`mcpRuntime/shared`, `lib/utils`,
 * `is-plan-event-enabled`) the same way the service worker glues them together
 * when handling an agent-issued tool call.
 *
 * Scenario covered:
 *   1. Agent supplies a bare hostname ("example.com").
 *   2. The runtime normalizes it, security-checks it, and only then accepts
 *      the navigation request.
 *   3. After navigation, a screenshot context is recorded for that tab.
 *   4. Token-budget-aware dimensions are computed for the screenshot.
 *   5. The tabs list is rendered for the LLM, marking the active tab.
 *   6. The plan-event feature flag governs whether the screenshot tool is
 *      surfaced to the agent at all.
 *
 * Failures here mean the contract between the MCP runtime modules has
 * regressed in a user-visible way, even if individual unit tests still pass.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  calculateOptimalDimensions,
  checkUrlSecurity,
  extractAppName,
  formatTabsOutput,
  normalizeUrl,
  screenshotContextManager
} from '../../src/mcpRuntime/shared';
import { cn } from '../../src/lib/utils';
import { isPlanEventEnabled } from '../../src/is-plan-event-enabled';

interface FakeTab {
  id: number;
  title: string;
  url: string;
}

const SCREENSHOT_CONFIG = {
  pxPerToken: 32,
  maxTargetPx: 1024,
  maxTargetTokens: 1600
};

async function simulateNavigateAndCaptureFlow(input: {
  tabId: number;
  rawUrl: string;
  viewportWidth: number;
  viewportHeight: number;
  rawScreenshotWidth: number;
  rawScreenshotHeight: number;
}) {
  const url = normalizeUrl(input.rawUrl);
  // Security must be checked against BOTH raw and normalized URLs: a naive
  // `normalizeUrl` would prepend "https://" to "chrome://settings", masking
  // the dangerous scheme from a post-normalize check alone.
  const rawCheck = await checkUrlSecurity(input.tabId, input.rawUrl, 'navigate');
  if (rawCheck) {
    return { ok: false as const, reason: rawCheck.error as string };
  }
  const securityError = await checkUrlSecurity(input.tabId, url, 'navigate');
  if (securityError) {
    return { ok: false as const, reason: securityError.error as string };
  }

  screenshotContextManager.setContext(input.tabId, {
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
    width: input.rawScreenshotWidth,
    height: input.rawScreenshotHeight
  });

  const [width, height] = calculateOptimalDimensions(
    input.rawScreenshotWidth,
    input.rawScreenshotHeight,
    SCREENSHOT_CONFIG
  );

  return {
    ok: true as const,
    url,
    appName: extractAppName(url),
    optimal: { width, height }
  };
}

describe('integration: agent navigation + screenshot capture flow', () => {
  beforeEach(() => {
    screenshotContextManager.clearAllContexts();
  });

  afterEach(() => {
    screenshotContextManager.clearAllContexts();
  });

  it('happy path: bare hostname is normalized, navigation succeeds, screenshot context recorded', async () => {
    const result = await simulateNavigateAndCaptureFlow({
      tabId: 100,
      rawUrl: 'example.com/products',
      viewportWidth: 1280,
      viewportHeight: 720,
      rawScreenshotWidth: 2560,
      rawScreenshotHeight: 1440
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.url).toBe('https://example.com/products');
    expect(result.appName).toBe('example');

    const ctx = screenshotContextManager.getContext(100);
    expect(ctx).toEqual({
      viewportWidth: 1280,
      viewportHeight: 720,
      screenshotWidth: 2560,
      screenshotHeight: 1440
    });

    expect(result.optimal.width).toBeLessThanOrEqual(SCREENSHOT_CONFIG.maxTargetPx);
    expect(result.optimal.height).toBeLessThanOrEqual(SCREENSHOT_CONFIG.maxTargetPx);
    // Aspect ratio (16:9) preserved within rounding tolerance.
    expect(Math.abs(result.optimal.width / result.optimal.height - 16 / 9)).toBeLessThan(0.05);
  });

  it.each([
    'chrome://settings',
    'chrome-extension://abc/page.html',
    'about:blank',
    'data:text/html,<h1>x</h1>',
    'javascript:alert(1)'
  ])('refuses to navigate to dangerous URL %s and never records a screenshot context', async (raw) => {
    const result = await simulateNavigateAndCaptureFlow({
      tabId: 200,
      rawUrl: raw,
      viewportWidth: 800,
      viewportHeight: 600,
      rawScreenshotWidth: 800,
      rawScreenshotHeight: 600
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/Cannot perform navigate on/);
    expect(screenshotContextManager.getContext(200)).toBeUndefined();
  });

  it('renders tab list with active marker after multi-tab navigation', async () => {
    const navigations = [
      { tabId: 1, rawUrl: 'foo.test', title: 'Foo' },
      { tabId: 2, rawUrl: 'https://bar.test/page', title: 'Bar' }
    ];

    const tabs: FakeTab[] = [];
    for (const nav of navigations) {
      const result = await simulateNavigateAndCaptureFlow({
        tabId: nav.tabId,
        rawUrl: nav.rawUrl,
        viewportWidth: 1024,
        viewportHeight: 768,
        rawScreenshotWidth: 1024,
        rawScreenshotHeight: 768
      });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      tabs.push({ id: nav.tabId, title: nav.title, url: result.url });
    }

    const out = formatTabsOutput(tabs, 7, 2);
    expect(out).toContain('Tab Group 7:');
    expect(out).toContain('- tabId 1: "Foo" (https://foo.test)');
    expect(out).toContain('- tabId 2: "Bar" (https://bar.test/page) (active)');
  });

  it('respects per-tab screenshot context isolation', async () => {
    await simulateNavigateAndCaptureFlow({
      tabId: 10,
      rawUrl: 'https://a.test',
      viewportWidth: 1280,
      viewportHeight: 720,
      rawScreenshotWidth: 1280,
      rawScreenshotHeight: 720
    });
    await simulateNavigateAndCaptureFlow({
      tabId: 20,
      rawUrl: 'https://b.test',
      viewportWidth: 800,
      viewportHeight: 600,
      rawScreenshotWidth: 800,
      rawScreenshotHeight: 600
    });

    expect(screenshotContextManager.getContext(10)?.viewportWidth).toBe(1280);
    expect(screenshotContextManager.getContext(20)?.viewportWidth).toBe(800);

    screenshotContextManager.clearContext(10);
    expect(screenshotContextManager.getContext(10)).toBeUndefined();
    expect(screenshotContextManager.getContext(20)).toBeDefined();
  });
});

describe('integration: feature flag gates screenshot tool exposure', () => {
  it('hides the tool when the override flag explicitly disables it', () => {
    const exposed = isPlanEventEnabled(
      { __default: { enabled: true } },
      { enabled: false }
    );
    expect(exposed).toBe(false);
  });

  it('shows the tool by default when no flag information is available', () => {
    expect(isPlanEventEnabled(undefined, undefined)).toBe(true);
  });

  it('combines with cn() to build a UI class string for the tool affordance', () => {
    const enabled = isPlanEventEnabled({ __default: { enabled: true } }, undefined);
    const className = cn(
      'tool',
      enabled && 'tool--available',
      !enabled && 'tool--hidden'
    );
    expect(className).toBe('tool tool--available');

    const disabledClass = cn(
      'tool',
      isPlanEventEnabled({ __default: { enabled: true } }, { enabled: false }) && 'tool--available',
      !isPlanEventEnabled({ __default: { enabled: true } }, { enabled: false }) && 'tool--hidden'
    );
    expect(disabledClass).toBe('tool tool--hidden');
  });
});
