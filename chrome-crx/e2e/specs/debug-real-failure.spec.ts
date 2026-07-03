import { test, expect } from '../fixtures/extension';

// This spec intentionally triggers a REAL failure through the production code
// path (cdpDebugger.attachDebugger → chrome.debugger.attach) and then checks
// that the collected debug bundle can pinpoint what went wrong and where. It
// is the end-to-end validation that the debug system is useful, not just
// present.

test.describe('debug locates a real failure', () => {
  test.afterEach(async ({ serviceWorker }) => {
    await serviceWorker.evaluate(() => {
      const bridge = (globalThis as { __superduckDebugBridge?: { resetDebugRecorder: () => void } })
        .__superduckDebugBridge;
      bridge?.resetDebugRecorder();
    });
  });

  test('debugger attach to a non-existent tab is captured + diagnosed', async ({
    serviceWorker
  }) => {
    // 1. Start recording.
    await serviceWorker.evaluate(async () => {
      const b = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      await b.startDebugSession({ extensionVersion: '0.1.0-real' });
    });

    // 2. Trigger a REAL failure: ask the production cdpDebugger to attach to a
    //    tab id that does not exist. chrome.debugger.attach will reject.
    const attachError = await serviceWorker.evaluate(async () => {
      const b = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      try {
        await b.realAttachDebugger(999999);
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    });
    expect(attachError).not.toBeNull();

    // 3. Collect the bundle.
    const bundle = await serviceWorker.evaluate(async () => {
      const b = (globalThis as { __superduckDebugBridge?: any }).__superduckDebugBridge;
      return await b.exportDebugBundle();
    });

    // 4. The cdp event stream must show the failed attach.
    const cdpEvents = bundle.eventsByDomain.cdp || [];
    const attachStart = cdpEvents.find((e: { event: string }) => e.event === 'cdp.attach.start');
    const attachEnd = cdpEvents.find((e: { event: string }) => e.event === 'cdp.attach.end');
    expect(attachStart).toBeDefined();
    expect(attachStart.ids.tabId).toBe(999999);
    expect(attachEnd).toBeDefined();
    expect(attachEnd.level).toBe('error');
    expect(attachEnd.data.success).toBe(false);
    expect(attachEnd.error?.message).toBeTruthy();

    // 5. Diagnosis must fire the debugger_attach_failed rule and point at the
    //    source file an agent should read next.
    const finding = bundle.diagnosis.findings.find(
      (f: { id: string }) => f.id === 'debugger_attach_failed'
    );
    expect(finding).toBeDefined();
    expect(finding.severity).toBe('error');
    expect(finding.domain).toBe('cdp');
    expect(finding.evidence.length).toBeGreaterThan(0);
    expect(finding.nextFiles).toContain('chrome-crx/src/mcpRuntime/cdp/debugger.ts');

    // 6. summary.agent.md must surface it as a top finding.
    expect(bundle.summaryMarkdown).toContain('debugger_attach_failed');
    expect(bundle.summaryMarkdown).toContain('Suggested Source Files');

    // 7. runtime-map.json must record the tab entity.
    expect(bundle.runtimeMap.tabs.some((t: { id: string }) => t.id === '999999')).toBe(true);
  });
});
