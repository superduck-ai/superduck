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
});
