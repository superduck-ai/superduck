import { test, expect } from '../fixtures/extension';

test.describe('debug evidence bundle', () => {
  test.afterEach(async ({ serviceWorker }) => {
    await serviceWorker.evaluate(() => {
      const bridge = (globalThis as { __superduckDebugBridge?: { resetDebugRecorder: () => void } })
        .__superduckDebugBridge;
      bridge?.resetDebugRecorder();
    });
  });

  test('collect exports a structured bundle with diagnosis + runtime map', async ({
    serviceWorker
  }) => {
    await serviceWorker.evaluate(async () => {
      const bridge = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      await bridge.startDebugSession({ extensionVersion: '0.1.0-test' });
    });

    await serviceWorker.evaluate(() => {
      const bridge = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      bridge.recordEvent({
        domain: 'tool-runtime',
        event: 'tool.request.received',
        ids: { requestId: 'r1', toolUseId: 'tu-1', tabId: 1 },
        data: { toolName: 'computer_screenshot', source: 'sidepanel' }
      });
      bridge.recordEvent({
        domain: 'cdp',
        event: 'cdp.attach.end',
        level: 'error',
        ids: { tabId: 1, requestId: 'r1' },
        data: { url: 'https://example.com/page?session=secret' }
      });
    });

    const bundle = await serviceWorker.evaluate(async () => {
      const bridge = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      return await bridge.exportDebugBundle();
    });

    expect(bundle).not.toBeNull();
    expect(bundle.session.debugSessionId).toBeTruthy();
    expect(bundle.session.extensionVersion).toBe('0.1.0-test');
    expect(bundle.eventsByDomain['tool-runtime'].length).toBeGreaterThan(0);
    expect(bundle.eventsByDomain.cdp.length).toBeGreaterThan(0);
    // cdp.attach.end error → diagnosis rule 3
    expect(bundle.diagnosis.findings.some((f: { id: string }) => f.id === 'debugger_attach_failed')).toBe(true);
    expect(bundle.summaryMarkdown).toContain('SuperDuck Debug Summary');
    expect(bundle.summaryMarkdown).toContain('Suggested Source Files');
    expect(bundle.runtimeMap.tabs.length).toBeGreaterThan(0);
    expect(bundle.runtimeMap.toolUses.length).toBeGreaterThan(0);
    expect(bundle.readme).toContain('summary.agent.md');
    // redaction in the persisted event
    const cdpEvent = bundle.eventsByDomain.cdp.find(
      (e: { event: string }) => e.event === 'cdp.attach.end'
    );
    expect(cdpEvent.data.url).toBe('https://example.com/page?[redacted-query]');
  });

  test('debug disabled is a no-op (collect returns null)', async ({ serviceWorker }) => {
    await serviceWorker.evaluate(() => {
      const bridge = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      bridge.resetDebugRecorder();
      bridge.recordEvent({ domain: 'tool-runtime', event: 'tool.request.received' });
    });
    const bundle = await serviceWorker.evaluate(async () => {
      const bridge = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      return await bridge.exportDebugBundle();
    });
    expect(bundle).toBeNull();
  });

  test('js runtime exception produces js_runtime_exception finding', async ({ serviceWorker }) => {
    await serviceWorker.evaluate(async () => {
      const bridge = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      await bridge.startDebugSession({ extensionVersion: '0.1.0' });
    });
    await serviceWorker.evaluate(() => {
      const bridge = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      bridge.recordEvent({
        domain: 'javascript',
        event: 'javascript.runtime.exception',
        level: 'error',
        ids: { tabId: 3, toolUseId: 'tu-2' },
        data: {
          exceptionSummary: 'ReferenceError: x is not defined',
          sourceUrl: 'https://app.test/script.js'
        }
      });
    });
    const bundle = await serviceWorker.evaluate(async () => {
      const bridge = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      return await bridge.exportDebugBundle();
    });
    expect(bundle.diagnosis.findings.some((f: { id: string }) => f.id === 'js_runtime_exception')).toBe(true);
  });

  test('tool timeout diagnosis: native request without CRX tool.request.received', async ({
    serviceWorker
  }) => {
    await serviceWorker.evaluate(async () => {
      const bridge = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      await bridge.startDebugSession({ extensionVersion: '0.1.0' });
    });
    await serviceWorker.evaluate(() => {
      const bridge = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      // native forwarded a request, but CRX never recorded tool.request.received
      bridge.recordEvent({
        domain: 'native-bridge',
        event: 'native.tool_request.forwarded',
        ids: { nativeRequestId: 'n-1' },
        data: { toolName: 'computer_screenshot' }
      });
    });
    const bundle = await serviceWorker.evaluate(async () => {
      const bridge = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      return await bridge.exportDebugBundle();
    });
    expect(
      bundle.diagnosis.findings.some((f: { id: string }) => f.id === 'native_tool_timeout_no_crx_start')
    ).toBe(true);
  });

  test('artifact content (screenshot + ax-summary) is included in the bundle', async ({
    serviceWorker
  }) => {
    await serviceWorker.evaluate(async () => {
      const bridge = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      await bridge.startDebugSession({ extensionVersion: '0.1.0' });
      await bridge.recordArtifact({
        type: 'screenshot',
        ids: { toolUseId: 'tu-1', tabId: 1 },
        mimeType: 'image/png',
        content: 'iVBORw0KGgo='
      });
      await bridge.recordArtifact({
        type: 'ax-summary',
        ids: { tabId: 1 },
        mimeType: 'text/plain',
        content: 'button OK\nlink Next'
      });
    });
    const bundle = await serviceWorker.evaluate(async () => {
      const bridge = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      return await bridge.exportDebugBundle();
    });
    const screenshot = bundle.artifacts.find((a: { type: string }) => a.type === 'screenshot');
    expect(screenshot).toBeDefined();
    expect(screenshot.content).toBe('iVBORw0KGgo=');
    expect(screenshot.sha256).toMatch(/^sha256-/);
    const ax = bundle.artifacts.find((a: { type: string }) => a.type === 'ax-summary');
    expect(ax).toBeDefined();
    expect(ax.content).toContain('button');
  });

  test('native messaging limit probe: bundle > 1MB', async ({ serviceWorker }) => {
    await serviceWorker.evaluate(async () => {
      const bridge = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      await bridge.startDebugSession({ extensionVersion: '0.1.0-limit-test' });
    });

    // Record enough events with large data to push the bundle past 1MB.
    // Each event ~10KB × 150 events ≈ 1.5MB raw.
    await serviceWorker.evaluate(() => {
      const bridge = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      const padding = 'x'.repeat(10_000);
      for (let i = 0; i < 150; i++) {
        bridge.recordEvent({
          domain: 'tool-runtime',
          event: 'tool.request.received',
          ids: { requestId: `r${i}`, toolUseId: `tu-${i}`, tabId: 1 },
          data: { toolName: 'computer_screenshot', iteration: i, payload: padding }
        });
      }
    });

    // 1. Direct export from CRX (IndexedDB) — no size limit, should be complete.
    const directBundle = await serviceWorker.evaluate(async () => {
      const bridge = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      return await bridge.exportDebugBundle();
    });
    expect(directBundle).not.toBeNull();
    const directEvents = directBundle.eventsByDomain['tool-runtime'];
    expect(directEvents.length).toBe(150);

    const directSize = JSON.stringify(directBundle).length;
    expect(directSize).toBeGreaterThan(1_000_000);

    // 2. serializeBundleForTransport with 150 events (< 200/domain cap):
    //    The 900KB budget is a soft target — truncation only kicks in when
    //    events exceed 200/domain. With 150 events the bundle passes through
    //    at full size (~1.69 MB). Chrome docs say CRX → native host allows
    //    64 MiB, so this is fine for the CRX → native host direction.
    const transportJson = await serviceWorker.evaluate(async () => {
      const bridge = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      const bundle = await bridge.exportDebugBundle();
      return bridge.serializeBundleForTransport(bundle);
    });
    const transportSize = transportJson.length;
    const transportBundle = JSON.parse(transportJson);
    const transportEvents = transportBundle.eventsByDomain['tool-runtime'];

    // eslint-disable-next-line no-console
    console.log(
      `[limit-probe] direct: ${directSize} bytes, ${directEvents.length} events | ` +
      `transport: ${transportSize} bytes, ${transportEvents.length} events`
    );

    // With < 200 events, transport preserves all events despite exceeding 900KB.
    expect(transportEvents.length).toBe(150);

    // 3. Now test with 250 events — previously this triggered truncation at 200.
    // After raising the cap to 5000 events / 32MB (matching the real Chrome
    // native messaging limit of 64 MiB CRX→host), 250 events should pass intact.
    await serviceWorker.evaluate(() => {
      const bridge = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      const padding = 'x'.repeat(10_000);
      for (let i = 150; i < 250; i++) {
        bridge.recordEvent({
          domain: 'tool-runtime',
          event: 'tool.request.received',
          ids: { requestId: `r${i}`, toolUseId: `tu-${i}`, tabId: 1 },
          data: { toolName: 'computer_screenshot', iteration: i, payload: padding }
        });
      }
    });

    const truncatedJson = await serviceWorker.evaluate(async () => {
      const bridge = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      const bundle = await bridge.exportDebugBundle();
      return bridge.serializeBundleForTransport(bundle);
    });
    const truncatedBundle = JSON.parse(truncatedJson);
    const truncatedEvents = truncatedBundle.eventsByDomain['tool-runtime'];

    // eslint-disable-next-line no-console
    console.log(
      `[limit-probe] after 250 events: transport has ${truncatedEvents.length} events, ` +
      `size ${truncatedJson.length} bytes`
    );

    // All 250 events should be preserved (cap is now 5000/domain, 32MB total).
    expect(truncatedEvents.length).toBe(250);
  });
});
