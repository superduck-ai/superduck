/**
 * Diagnosis rule engine.
 *
 * Rules are intentionally simple: each scans the event stream for a known
 * failure signature and, on hit, emits a Finding that points the agent at the
 * source files most likely to explain it. This is not ML — it is a library of
 * "if you see X, look at Y" heuristics derived from the failure modes listed
 * in docs/debug-capability-plan.md.
 */

import type { DebugArtifact, DebugBaseEvent, DebugDomain } from './schema';

export type DiagnosisSeverity = 'error' | 'warn' | 'info';

export interface DiagnosisFinding {
  id: string;
  severity: DiagnosisSeverity;
  domain: DebugDomain;
  evidence: string[];
  likelyCause: string;
  nextFiles: string[];
  data?: Record<string, unknown>;
}

export interface DiagnosisResult {
  summary: string;
  findings: DiagnosisFinding[];
}

type RuleFn = (events: DebugBaseEvent[], artifacts: DebugArtifact[]) => DiagnosisFinding[];

function byName(events: DebugBaseEvent[], name: string): DebugBaseEvent[] {
  return events.filter((e) => e.event === name);
}

function eventFailed(e: DebugBaseEvent): boolean {
  if (e.level === 'error') return true;
  const d = e.data as Record<string, unknown> | undefined;
  if (!d) return false;
  return d.success === false || d.isError === true || d.failed === true;
}

function idsMatch(a: DebugBaseEvent, b: DebugBaseEvent, key: keyof DebugBaseEvent['ids']): boolean {
  const av = a.ids[key];
  const bv = b.ids[key];
  return av !== undefined && bv !== undefined && av === bv;
}

// Rule 1: native/MCP has a tool request, but CRX never received it.
function nativeToolTimeoutNoCrxStart(events: DebugBaseEvent[]): DiagnosisFinding[] {
  const forwarded = byName(events, 'native.tool_request.forwarded');
  const received = byName(events, 'tool.request.received');
  const findings: DiagnosisFinding[] = [];
  for (const f of forwarded) {
    const nativeId = f.ids.nativeRequestId;
    if (!nativeId) continue;
    const crxGotIt = received.some((r) => r.ids.nativeRequestId === nativeId);
    if (!crxGotIt) {
      findings.push({
        id: 'native_tool_timeout_no_crx_start',
        severity: 'error',
        domain: 'native-bridge',
        evidence: [f.eventId],
        likelyCause: `Native/MCP forwarded tool request ${nativeId} but CRX never recorded tool.request.received. The request was lost between native-host UDS, Chrome native messaging, and the CRX service worker.`,
        nextFiles: [
          'chrome-native-host/internal/bridge/native_host.go',
          'chrome-crx/src/background/nativeHost.ts',
          'chrome-crx/src/mcpRuntime/toolExecution/toolExecution.ts'
        ],
        data: {
          nativeRequestId: nativeId,
          toolName: (f.data?.toolName ?? f.data?.tool) as string | undefined
        }
      });
    }
  }
  return findings;
}

// Rule 2: CRX received the tool request, but ToolExecutor never started.
function crxToolStartNoExecutor(events: DebugBaseEvent[]): DiagnosisFinding[] {
  const received = byName(events, 'tool.request.received');
  const executorStart = byName(events, 'tool.executor.start');
  const findings: DiagnosisFinding[] = [];
  for (const r of received) {
    const reqId = r.ids.requestId;
    if (!reqId) continue;
    const started = executorStart.some((e) => idsMatch(e, r, 'requestId'));
    if (!started) {
      findings.push({
        id: 'crx_tool_start_no_executor',
        severity: 'error',
        domain: 'tool-runtime',
        evidence: [r.eventId],
        likelyCause: `Tool request ${reqId} reached CRX but tool.executor.start was never recorded. Failure is in tab resolution, permission, or debugger attach — before the executor runs.`,
        nextFiles: [
          'chrome-crx/src/mcpRuntime/toolExecution/toolExecution.ts',
          'chrome-crx/src/mcpRuntime/toolExecution/toolExecutor.ts',
          'chrome-crx/src/mcpRuntime/cdp/debugger.ts'
        ],
        data: { requestId: reqId, toolName: r.data?.toolName }
      });
    }
  }
  return findings;
}

// Rule 3: debugger attach failed.
function debuggerAttachFailed(events: DebugBaseEvent[]): DiagnosisFinding[] {
  const attachEnds = events.filter(
    (e) => e.event === 'tool.debugger.attach.end' || e.event === 'cdp.attach.end'
  );
  const findings: DiagnosisFinding[] = [];
  for (const e of attachEnds) {
    if (eventFailed(e)) {
      const url = e.data?.url as string | undefined;
      const isInternal =
        !!url &&
        (url.startsWith('chrome://') ||
          url.startsWith('edge://') ||
          url.startsWith('chrome-extension://') ||
          url.startsWith('about:'));
      findings.push({
        id: 'debugger_attach_failed',
        severity: 'error',
        domain: 'cdp',
        evidence: [e.eventId],
        likelyCause: isInternal
          ? `Debugger attach failed on internal page ${url}. CDP cannot attach to chrome:// / edge:// / extension:// pages.`
          : 'Chrome debugger attach failed or the user canceled the debugger banner.',
        nextFiles: [
          'chrome-crx/src/mcpRuntime/cdp/debugger.ts',
          'chrome-crx/src/mcpRuntime/toolExecution/toolExecution.ts'
        ],
        data: { tabId: e.ids.tabId, url, internal: isInternal }
      });
    }
  }
  return findings;
}

// Rule 4: sidepanel render or store mutation spike.
function sidepanelRenderSpike(events: DebugBaseEvent[]): DiagnosisFinding[] {
  const spikes = events.filter(
    (e) => e.event === 'sidepanel.render.spike' || e.event === 'sidepanel.store.set_state.spike'
  );
  if (spikes.length === 0) return [];
  const top = spikes.slice(0, 3);
  return [
    {
      id: 'sidepanel_render_spike',
      severity: 'warn',
      domain: 'sidepanel',
      evidence: top.map((e) => e.eventId),
      likelyCause: `Detected ${spikes.length} render/store-mutation spike(s). Top component: ${top[0].data?.component ?? 'unknown'}, store: ${top[0].data?.store ?? 'unknown'}.`,
      nextFiles: [
        'chrome-crx/src/sidepanel/SidepanelApp.tsx',
        'chrome-crx/src/sidepanel/hooks/useSidepanelState.ts',
        'chrome-crx/src/sidepanel/stores/'
      ],
      data: {
        spikeCount: spikes.length,
        topComponents: top.map((e) => e.data?.component),
        topStores: top.map((e) => e.data?.store)
      }
    }
  ];
}

// Rule 5: click DOM identity changed.
function clickDomIdentityChanged(events: DebugBaseEvent[]): DiagnosisFinding[] {
  const inputActions = byName(events, 'input.action.end').filter(
    (e) => e.data?.actionType === 'click' || e.data?.action === 'click'
  );
  const findings: DiagnosisFinding[] = [];
  for (const e of inputActions) {
    if (e.data?.identityChanged === true || e.data?.domIdentityChanged === true) {
      findings.push({
        id: 'click_dom_identity_changed',
        severity: 'error',
        domain: 'input',
        evidence: [e.eventId],
        likelyCause:
          'mousedown/mouseup/click landed on different DOM nodes, with a render spike in between. React likely replaced the DOM node between pointer events.',
        nextFiles: [
          'chrome-crx/src/sidepanel/SidepanelApp.tsx',
          'chrome-crx/src/mcpRuntime/cdp/input.ts',
          'chrome-crx/src/mcpRuntime/inputTools/computerTool.ts'
        ],
        data: { tabId: e.ids.tabId, component: e.data?.component }
      });
    }
  }
  return findings;
}

// Rule 6: stale ref after navigation.
function staleRefAfterNavigation(events: DebugBaseEvent[]): DiagnosisFinding[] {
  const resolveStale = events.filter(
    (e) => e.event === 'ref.resolve_stale.end' || (e.event === 'ref.resolve.end' && eventFailed(e))
  );
  if (resolveStale.length === 0) return [];
  const navs = events.filter(
    (e) => e.event === 'tab.navigation.end' || e.event === 'snapshot_cache.invalidate'
  );
  const findings: DiagnosisFinding[] = [];
  for (const s of resolveStale) {
    const priorNav = navs.find((n) => n.ts <= s.ts && idsMatch(n, s, 'tabId'));
    if (priorNav) {
      findings.push({
        id: 'stale_ref_after_navigation',
        severity: 'error',
        domain: 'screenshot-ref',
        evidence: [s.eventId, priorNav.eventId],
        likelyCause:
          'Ref resolve failed after a main-frame navigation or snapshot invalidation. The ref pointed at a node that no longer exists.',
        nextFiles: [
          'chrome-crx/src/mcpRuntime/screenshot/refBridge.ts',
          'chrome-crx/src/mcpRuntime/pageToolsSupport/snapshotCache.ts'
        ],
        data: { tabId: s.ids.tabId, refId: s.data?.refId }
      });
    }
  }
  return findings;
}

// Rule 7: annotated screenshot produced no labels.
function annotatedScreenshotNoRefs(events: DebugBaseEvent[]): DiagnosisFinding[] {
  const annotateEnds = byName(events, 'screenshot.annotate.end');
  const findings: DiagnosisFinding[] = [];
  for (const e of annotateEnds) {
    const annotationCount = (e.data?.annotationCount as number) ?? 0;
    const refMetaEmpty = e.data?.refMetaEmpty === true;
    const quadsAllFailed = e.data?.contentQuadsAllFailed === true;
    if (annotationCount === 0 || refMetaEmpty || quadsAllFailed) {
      let cause: string;
      if (refMetaEmpty) cause = 'refMeta was empty — no refs were registered before annotation.';
      else if (quadsAllFailed)
        cause = 'DOM.getContentQuads failed for every ref — the page may have detached the nodes.';
      else cause = 'Annotation produced zero labels.';
      findings.push({
        id: 'annotated_screenshot_no_refs',
        severity: 'warn',
        domain: 'screenshot-ref',
        evidence: [e.eventId],
        likelyCause: cause,
        nextFiles: [
          'chrome-crx/src/mcpRuntime/screenshot/annotatedScreenshot.ts',
          'chrome-crx/src/mcpRuntime/screenshot/refBridge.ts'
        ],
        data: { tabId: e.ids.tabId, annotationCount, refMetaEmpty, quadsAllFailed }
      });
    }
  }
  return findings;
}

// Rule 8: JS Runtime.evaluate threw.
function jsRuntimeException(events: DebugBaseEvent[]): DiagnosisFinding[] {
  const exc = events.filter(
    (e) =>
      e.event === 'javascript.runtime.exception' ||
      (e.event === 'javascript.runtime.evaluate.end' && e.data?.exceptionDetails)
  );
  return exc.map((e) => ({
    id: 'js_runtime_exception',
    severity: 'error',
    domain: 'javascript',
    evidence: [e.eventId],
    likelyCause: `Runtime.evaluate threw: ${e.data?.exceptionSummary ?? e.error?.message ?? 'unknown'}`,
    nextFiles: [
      'chrome-crx/src/mcpRuntime/pageTools/javascriptTool.ts',
      'chrome-crx/src/mcpRuntime/pageToolsSupport/wrapUserCode.ts'
    ],
    data: {
      tabId: e.ids.tabId,
      toolUseId: e.ids.toolUseId,
      sourceUrl: e.data?.sourceUrl,
      exceptionSummary: e.data?.exceptionSummary
    }
  }));
}

// Rule 9: window.open fired but no tab was adopted.
function jsChildTabAdoptionMismatch(events: DebugBaseEvent[]): DiagnosisFinding[] {
  const windowOpens = events.filter(
    (e) => e.event === 'javascript.window_open.detected' || e.event === 'cdp.window_open'
  );
  const findings: DiagnosisFinding[] = [];
  for (const e of windowOpens) {
    const raw = e.data?.adoptedTabIds;
    const adopted = Array.isArray(raw) ? raw : [];
    if (adopted.length === 0) {
      findings.push({
        id: 'js_child_tab_adoption_mismatch',
        severity: 'warn',
        domain: 'javascript',
        evidence: [e.eventId],
        likelyCause:
          'A window.open event was detected but no child tab was adopted into the MCP tab group.',
        nextFiles: [
          'chrome-crx/src/mcpRuntime/navigationIsolation/',
          'chrome-crx/src/mcpRuntime/tabState/mcpTabGroup.ts'
        ],
        data: { tabId: e.ids.tabId, targetUrl: e.data?.targetUrl }
      });
    }
  }
  return findings;
}

// Rule 10: workflow event dropped or deduped.
function workflowEventDropped(events: DebugBaseEvent[]): DiagnosisFinding[] {
  const dropped = events.filter(
    (e) => e.event === 'workflow.event.dropped' || e.event === 'workflow.event.deduped'
  );
  return dropped.map((e) => ({
    id: 'workflow_event_dropped',
    severity: 'warn',
    domain: 'workflow-recording',
    evidence: [e.eventId],
    likelyCause: `Workflow event was ${e.event === 'workflow.event.deduped' ? 'deduped' : 'dropped'}: ${e.data?.reason ?? 'unknown reason'}.`,
    nextFiles: [
      'chrome-crx/src/sidepanel/workflowRecording/handleCapturedEvent.ts',
      'chrome-crx/src/sidepanel/elementSelectorInjector.ts'
    ],
    data: { reason: e.data?.reason, tabId: e.ids.tabId, eventType: e.data?.eventType }
  }));
}

// Rule 11: workflow captured an event but screenshot artifact is missing.
function workflowScreenshotFailed(events: DebugBaseEvent[]): DiagnosisFinding[] {
  const captured = byName(events, 'workflow.event.captured');
  const screenshotEnds = byName(events, 'workflow.screenshot.end');
  const findings: DiagnosisFinding[] = [];
  for (const c of captured) {
    const recId = c.ids.workflowRecordingId;
    const hasScreenshot = screenshotEnds.some(
      (s) => (!recId || s.ids.workflowRecordingId === recId) && !eventFailed(s)
    );
    if (!hasScreenshot) {
      findings.push({
        id: 'workflow_screenshot_failed',
        severity: 'warn',
        domain: 'workflow-recording',
        evidence: [c.eventId],
        likelyCause:
          'A workflow event was captured but no successful screenshot artifact was produced for it.',
        nextFiles: [
          'chrome-crx/src/sidepanel/hooks/useScreenCapture.ts',
          'chrome-crx/src/sidepanel/workflowRecording/handleCapturedEvent.ts'
        ],
        data: { workflowRecordingId: recId, tabId: c.ids.tabId }
      });
    }
  }
  return findings;
}

// Rule 12: permission required but no prompt handler.
function permissionPromptMissingHandler(events: DebugBaseEvent[]): DiagnosisFinding[] {
  const required = byName(events, 'tool.permission.required');
  const findings: DiagnosisFinding[] = [];
  for (const e of required) {
    if (e.data?.handlerExists === false) {
      findings.push({
        id: 'permission_prompt_missing_handler',
        severity: 'error',
        domain: 'permission',
        evidence: [e.eventId],
        likelyCause:
          'A tool required permission but no permission prompt handler was registered. The request cannot proceed interactively.',
        nextFiles: [
          'chrome-crx/src/mcpRuntime/toolExecution/permissionPrompt.ts',
          'chrome-crx/src/mcpRuntime/toolExecution/toolExecution.ts'
        ],
        data: { requestId: e.ids.requestId, toolName: e.data?.toolName }
      });
    }
  }
  return findings;
}

// Rule 13: input action succeeded but the page did not change.
function toolSuccessButPageUnchanged(events: DebugBaseEvent[]): DiagnosisFinding[] {
  const inputEnds = byName(events, 'input.action.end').filter((e) => !eventFailed(e));
  const findings: DiagnosisFinding[] = [];
  for (const e of inputEnds) {
    const pageChanged = e.data?.pageChanged === true;
    const urlSame = e.data?.beforeAfterUrlSame === true;
    const screenshotChanged = e.data?.screenshotHashChanged === true;
    if (!pageChanged && urlSame && !screenshotChanged) {
      findings.push({
        id: 'tool_success_but_page_unchanged',
        severity: 'warn',
        domain: 'input',
        evidence: [e.eventId],
        likelyCause:
          'Input action reported success, but before/after URL and screenshot hash are both unchanged. The page may have swallowed the event, or the ref/coordinate missed the target.',
        nextFiles: [
          'chrome-crx/src/mcpRuntime/cdp/input.ts',
          'chrome-crx/src/mcpRuntime/inputTools/computerTool.ts'
        ],
        data: {
          tabId: e.ids.tabId,
          action: e.data?.action,
          refId: e.data?.refId
        }
      });
    }
  }
  return findings;
}

const RULES: RuleFn[] = [
  (events) => nativeToolTimeoutNoCrxStart(events),
  (events) => crxToolStartNoExecutor(events),
  (events) => debuggerAttachFailed(events),
  (events) => sidepanelRenderSpike(events),
  (events) => clickDomIdentityChanged(events),
  (events) => staleRefAfterNavigation(events),
  (events) => annotatedScreenshotNoRefs(events),
  (events) => jsRuntimeException(events),
  (events) => jsChildTabAdoptionMismatch(events),
  (events) => workflowEventDropped(events),
  (events) => workflowScreenshotFailed(events),
  (events) => permissionPromptMissingHandler(events),
  (events) => toolSuccessButPageUnchanged(events)
];

const SEVERITY_RANK: Record<DiagnosisSeverity, number> = { error: 0, warn: 1, info: 2 };

export function diagnose(
  events: DebugBaseEvent[],
  artifacts: DebugArtifact[] = []
): DiagnosisResult {
  const findings: DiagnosisFinding[] = [];
  for (const rule of RULES) {
    try {
      findings.push(...rule(events, artifacts));
    } catch {
      // a broken rule must never break diagnosis
    }
  }
  findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const summary = buildSummary(findings, events);
  return { summary, findings };
}

function buildSummary(findings: DiagnosisFinding[], events: DebugBaseEvent[]): string {
  if (findings.length === 0) {
    const errors = events.filter((e) => e.level === 'error');
    if (errors.length > 0) {
      return `No diagnosis rule matched, but ${errors.length} error-level event(s) were recorded. Inspect events/*.jsonl for error-level entries.`;
    }
    return 'No issues detected by diagnosis rules. Inspect events/*.jsonl for the full trace.';
  }
  const top = findings.slice(0, 3);
  const lines = top.map((f) => `[${f.severity}] ${f.id}: ${f.likelyCause}`);
  return `Top ${top.length} finding(s):\n${lines.join('\n')}`;
}
