import { describe, it, expect } from 'vitest';
import { diagnose } from './diagnostics';
import type { DebugBaseEvent, DebugDomain } from './schema';

function mk(
  partial: Partial<DebugBaseEvent> & { domain: DebugDomain; event: string }
): DebugBaseEvent {
  return {
    schemaVersion: 1,
    eventId: partial.eventId ?? `e-${Math.random().toString(36).slice(2, 10)}`,
    ts: partial.ts ?? '2026-06-27T12:00:00.000Z',
    debugSessionId: 'session-1',
    domain: partial.domain,
    event: partial.event,
    level: partial.level ?? 'info',
    ids: partial.ids ?? {},
    data: partial.data,
    artifactRefs: partial.artifactRefs,
    durationMs: partial.durationMs,
    error: partial.error
  };
}

describe('diagnose', () => {
  it('rule 1: native_tool_timeout_no_crx_start', () => {
    const events = [
      mk({
        domain: 'native-bridge',
        event: 'native.tool_request.forwarded',
        ids: { nativeRequestId: 'n-1' },
        data: { toolName: 'computer_screenshot' }
      })
    ];
    const result = diagnose(events);
    const f = result.findings.find((x) => x.id === 'native_tool_timeout_no_crx_start');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('error');
    expect(f?.nextFiles).toContain('chrome-crx/src/background/nativeHost.ts');
  });

  it('rule 1: does not fire when CRX received the request', () => {
    const events = [
      mk({
        domain: 'native-bridge',
        event: 'native.tool_request.forwarded',
        ids: { nativeRequestId: 'n-1' }
      }),
      mk({
        domain: 'tool-runtime',
        event: 'tool.request.received',
        ids: { nativeRequestId: 'n-1', requestId: 'r-1' }
      })
    ];
    const result = diagnose(events);
    expect(
      result.findings.find((x) => x.id === 'native_tool_timeout_no_crx_start')
    ).toBeUndefined();
  });

  it('rule 2: crx_tool_start_no_executor', () => {
    const events = [
      mk({
        domain: 'tool-runtime',
        event: 'tool.request.received',
        ids: { requestId: 'r-1' },
        data: { toolName: 'computer_screenshot' }
      })
    ];
    const result = diagnose(events);
    const f = result.findings.find((x) => x.id === 'crx_tool_start_no_executor');
    expect(f).toBeDefined();
    expect(f?.nextFiles).toContain('chrome-crx/src/mcpRuntime/toolExecution/toolExecutor.ts');
  });

  it('rule 2: does not fire when executor started', () => {
    const events = [
      mk({
        domain: 'tool-runtime',
        event: 'tool.request.received',
        ids: { requestId: 'r-1' }
      }),
      mk({
        domain: 'tool-runtime',
        event: 'tool.executor.start',
        ids: { requestId: 'r-1' }
      })
    ];
    const result = diagnose(events);
    expect(result.findings.find((x) => x.id === 'crx_tool_start_no_executor')).toBeUndefined();
  });

  it('rule 3: debugger_attach_failed on internal page', () => {
    const events = [
      mk({
        domain: 'cdp',
        event: 'cdp.attach.end',
        level: 'error',
        ids: { tabId: 1 },
        data: { url: 'chrome://settings' }
      })
    ];
    const result = diagnose(events);
    const f = result.findings.find((x) => x.id === 'debugger_attach_failed');
    expect(f).toBeDefined();
    expect(f?.data?.internal).toBe(true);
  });

  it('rule 3: debugger_attach_failed on normal page', () => {
    const events = [
      mk({
        domain: 'tool-runtime',
        event: 'tool.debugger.attach.end',
        data: { success: false },
        ids: { tabId: 2 }
      })
    ];
    const result = diagnose(events);
    const f = result.findings.find((x) => x.id === 'debugger_attach_failed');
    expect(f).toBeDefined();
    expect(f?.data?.internal).toBe(false);
  });

  it('rule 4: sidepanel_render_spike', () => {
    const events = [
      mk({
        domain: 'sidepanel',
        event: 'sidepanel.render.spike',
        data: { component: 'ChatInputArea', store: 'messageStore', count: 50 }
      }),
      mk({
        domain: 'sidepanel',
        event: 'sidepanel.store.set_state.spike',
        data: { store: 'messageStore', component: 'ChatInputArea' }
      })
    ];
    const result = diagnose(events);
    const f = result.findings.find((x) => x.id === 'sidepanel_render_spike');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('warn');
    expect(f?.data?.spikeCount).toBe(2);
  });

  it('rule 5: click_dom_identity_changed', () => {
    const events = [
      mk({
        domain: 'input',
        event: 'input.action.end',
        ids: { tabId: 1 },
        data: { actionType: 'click', identityChanged: true, component: 'SendButton' }
      })
    ];
    const result = diagnose(events);
    const f = result.findings.find((x) => x.id === 'click_dom_identity_changed');
    expect(f).toBeDefined();
    expect(f?.nextFiles).toContain('chrome-crx/src/sidepanel/SidepanelApp.tsx');
  });

  it('rule 6: stale_ref_after_navigation', () => {
    const events = [
      mk({
        domain: 'tab-state',
        event: 'tab.navigation.end',
        ids: { tabId: 5 },
        ts: '2026-06-27T12:00:00.000Z'
      }),
      mk({
        domain: 'screenshot-ref',
        event: 'ref.resolve_stale.end',
        ids: { tabId: 5 },
        ts: '2026-06-27T12:00:01.000Z',
        data: { refId: 'ref-9' }
      })
    ];
    const result = diagnose(events);
    const f = result.findings.find((x) => x.id === 'stale_ref_after_navigation');
    expect(f).toBeDefined();
    expect(f?.evidence).toHaveLength(2);
  });

  it('rule 7: annotated_screenshot_no_refs', () => {
    const events = [
      mk({
        domain: 'screenshot-ref',
        event: 'screenshot.annotate.end',
        ids: { tabId: 1 },
        data: { annotationCount: 0, refMetaEmpty: true }
      })
    ];
    const result = diagnose(events);
    const f = result.findings.find((x) => x.id === 'annotated_screenshot_no_refs');
    expect(f).toBeDefined();
    expect(f?.data?.refMetaEmpty).toBe(true);
  });

  it('rule 8: js_runtime_exception', () => {
    const events = [
      mk({
        domain: 'javascript',
        event: 'javascript.runtime.exception',
        ids: { tabId: 3, toolUseId: 'tu-2' },
        data: { exceptionSummary: 'ReferenceError: x is not defined', sourceUrl: 'about:blank' }
      })
    ];
    const result = diagnose(events);
    const f = result.findings.find((x) => x.id === 'js_runtime_exception');
    expect(f).toBeDefined();
    expect(f?.data?.sourceUrl).toBe('about:blank');
  });

  it('rule 9: js_child_tab_adoption_mismatch', () => {
    const events = [
      mk({
        domain: 'javascript',
        event: 'javascript.window_open.detected',
        ids: { tabId: 1 },
        data: { adoptedTabIds: [], targetUrl: 'https://example.com' }
      })
    ];
    const result = diagnose(events);
    const f = result.findings.find((x) => x.id === 'js_child_tab_adoption_mismatch');
    expect(f).toBeDefined();
  });

  it('rule 10: workflow_event_dropped', () => {
    const events = [
      mk({
        domain: 'workflow-recording',
        event: 'workflow.event.dropped',
        ids: { workflowRecordingId: 'w-1' },
        data: { reason: 'outside_group', eventType: 'click' }
      })
    ];
    const result = diagnose(events);
    const f = result.findings.find((x) => x.id === 'workflow_event_dropped');
    expect(f).toBeDefined();
    expect(f?.data?.reason).toBe('outside_group');
  });

  it('rule 11: workflow_screenshot_failed', () => {
    const events = [
      mk({
        domain: 'workflow-recording',
        event: 'workflow.event.captured',
        ids: { workflowRecordingId: 'w-1', tabId: 1 }
      })
    ];
    const result = diagnose(events);
    const f = result.findings.find((x) => x.id === 'workflow_screenshot_failed');
    expect(f).toBeDefined();
  });

  it('rule 11: does not fire when screenshot succeeded', () => {
    const events = [
      mk({
        domain: 'workflow-recording',
        event: 'workflow.event.captured',
        ids: { workflowRecordingId: 'w-1' }
      }),
      mk({
        domain: 'workflow-recording',
        event: 'workflow.screenshot.end',
        ids: { workflowRecordingId: 'w-1' }
      })
    ];
    const result = diagnose(events);
    expect(result.findings.find((x) => x.id === 'workflow_screenshot_failed')).toBeUndefined();
  });

  it('rule 12: permission_prompt_missing_handler', () => {
    const events = [
      mk({
        domain: 'permission',
        event: 'tool.permission.required',
        ids: { requestId: 'r-9' },
        data: { handlerExists: false, toolName: 'navigate' }
      })
    ];
    const result = diagnose(events);
    const f = result.findings.find((x) => x.id === 'permission_prompt_missing_handler');
    expect(f).toBeDefined();
  });

  it('rule 13: tool_success_but_page_unchanged', () => {
    const events = [
      mk({
        domain: 'input',
        event: 'input.action.end',
        ids: { tabId: 1 },
        data: {
          action: 'click',
          beforeAfterUrlSame: true,
          screenshotHashChanged: false,
          pageChanged: false,
          refId: 'ref-3'
        }
      })
    ];
    const result = diagnose(events);
    const f = result.findings.find((x) => x.id === 'tool_success_but_page_unchanged');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('warn');
  });

  it('produces a summary listing top findings', () => {
    const events = [
      mk({
        domain: 'cdp',
        event: 'cdp.attach.end',
        level: 'error',
        ids: { tabId: 1 },
        data: { url: 'https://example.com' }
      })
    ];
    const result = diagnose(events);
    expect(result.summary).toContain('debugger_attach_failed');
  });

  it('returns no-findings summary on clean trace', () => {
    const result = diagnose([]);
    expect(result.findings).toHaveLength(0);
    expect(result.summary).toContain('No issues');
  });

  it('sorts findings by severity (error before warn)', () => {
    const events = [
      mk({
        domain: 'sidepanel',
        event: 'sidepanel.render.spike',
        data: { component: 'X' }
      }),
      mk({
        domain: 'cdp',
        event: 'cdp.attach.end',
        level: 'error',
        ids: { tabId: 1 },
        data: { url: 'https://example.com' }
      })
    ];
    const result = diagnose(events);
    const severities = result.findings.map((f) => f.severity);
    const firstWarn = severities.indexOf('warn');
    const firstError = severities.indexOf('error');
    expect(firstError).toBeLessThan(firstWarn);
    expect(firstError).toBeGreaterThanOrEqual(0);
  });
});
