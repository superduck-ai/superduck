/**
 * Export bundle builder.
 *
 * Assembles the in-memory event stream + artifacts into the structured bundle
 * that `superduck debug collect` writes to disk. The bundle is the first
 * deliverable an agent reads: summary.agent.md and diagnosis.json must be
 * enough to point at the failing domain without re-running instrumentation.
 */

import type { DebugArtifact, DebugBaseEvent, DebugDomain, DebugSessionMeta } from './schema';
import { DEBUG_DOMAINS } from './schema';
import { buildRuntimeMap, type RuntimeMap } from './runtimeMap';
import { diagnose, type DiagnosisResult } from './diagnostics';

export interface DebugBundle {
  session: DebugSessionMeta;
  eventsByDomain: Record<DebugDomain, DebugBaseEvent[]>;
  artifacts: DebugArtifact[];
  runtimeMap: RuntimeMap;
  diagnosis: DiagnosisResult;
  summaryMarkdown: string;
  readme: string;
  generatedAt: string;
}

export function groupEventsByDomain(
  events: DebugBaseEvent[]
): Record<DebugDomain, DebugBaseEvent[]> {
  const out = {} as Record<DebugDomain, DebugBaseEvent[]>;
  for (const d of DEBUG_DOMAINS) out[d] = [];
  for (const e of events) {
    out[e.domain]?.push(e);
  }
  return out;
}

export function buildBundle(
  events: DebugBaseEvent[],
  artifacts: DebugArtifact[],
  session: DebugSessionMeta
): DebugBundle {
  const eventsByDomain = groupEventsByDomain(events);
  const runtimeMap = buildRuntimeMap(events, artifacts, session);
  const diagnosis = diagnose(events, artifacts);
  const generatedAt = new Date().toISOString();
  const bundle: DebugBundle = {
    session,
    eventsByDomain,
    artifacts,
    runtimeMap,
    diagnosis,
    summaryMarkdown: '',
    readme: '',
    generatedAt
  };
  bundle.summaryMarkdown = buildSummaryMarkdown(bundle);
  bundle.readme = buildReadme();
  return bundle;
}

interface EventListItem {
  eventId: string;
  domain: DebugDomain;
  event: string;
  ts: string;
  message?: string;
  durationMs?: number;
}

function topErrors(events: DebugBaseEvent[], n: number): EventListItem[] {
  return events
    .filter((e) => e.level === 'error')
    .slice(-n)
    .map((e) => ({
      eventId: e.eventId,
      domain: e.domain,
      event: e.event,
      ts: e.ts,
      message: e.error?.message ?? (e.data?.errorType as string | undefined)
    }));
}

function topSlowOperations(events: DebugBaseEvent[], n: number): EventListItem[] {
  return events
    .filter((e) => typeof e.durationMs === 'number' && e.durationMs > 0)
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
    .slice(0, n)
    .map((e) => ({
      eventId: e.eventId,
      domain: e.domain,
      event: e.event,
      ts: e.ts,
      durationMs: e.durationMs
    }));
}

function suggestedSourceFiles(findings: DiagnosisResult['findings']): string[] {
  const set = new Set<string>();
  for (const f of findings) for (const file of f.nextFiles) set.add(file);
  return [...set];
}

export function buildSummaryMarkdown(bundle: DebugBundle): string {
  const { session, runtimeMap, diagnosis, eventsByDomain } = bundle;
  const allEvents = DEBUG_DOMAINS.flatMap((d) => eventsByDomain[d]);
  const errors = topErrors(allEvents, 5);
  const slow = topSlowOperations(allEvents, 5);
  const files = suggestedSourceFiles(diagnosis.findings);

  const lines: string[] = [];
  lines.push('# SuperDuck Debug Summary');
  lines.push('');
  lines.push('## Session');
  lines.push(`- debugSessionId: ${session.debugSessionId}`);
  lines.push(`- runtimeSessionId: ${session.runtimeSessionId}`);
  lines.push(`- timeRange: ${session.startedAt} → ${session.endedAt ?? '(active)'}`);
  lines.push(`- extensionVersion: ${session.extensionVersion || '(unknown)'}`);
  lines.push(`- nativeHostVersion: ${session.nativeHostVersion ?? '(unknown)'}`);
  lines.push(`- browser: ${session.browser ?? '(unknown)'}`);
  lines.push(`- events: ${session.eventCount} | artifacts: ${session.artifactCount}`);
  lines.push('');

  lines.push('## Top Findings');
  if (diagnosis.findings.length === 0) {
    lines.push('- (no findings matched)');
  } else {
    diagnosis.findings.slice(0, 5).forEach((f, i) => {
      lines.push(`${i + 1}. [${f.severity}] ${f.id} (${f.domain}): ${f.likelyCause}`);
    });
  }
  lines.push('');

  lines.push('## Runtime Map');
  lines.push(`- sidepanels: ${runtimeMap.sidepanels.map((s) => s.id).join(', ') || '(none)'}`);
  lines.push(`- agentRuns: ${runtimeMap.agentRuns.map((s) => s.id).join(', ') || '(none)'}`);
  lines.push(
    `- lightningIterations: ${runtimeMap.lightningIterations.map((s) => s.id).join(', ') || '(none)'}`
  );
  lines.push(`- toolUses: ${runtimeMap.toolUses.map((s) => s.id).join(', ') || '(none)'}`);
  lines.push(`- tabs: ${runtimeMap.tabs.map((s) => s.id).join(', ') || '(none)'}`);
  lines.push(
    `- nativeRequests: ${runtimeMap.nativeRequests.map((s) => s.id).join(', ') || '(none)'}`
  );
  lines.push(
    `- workflowRecordings: ${runtimeMap.workflowRecordings.map((s) => s.id).join(', ') || '(none)'}`
  );
  lines.push(`- artifacts: ${runtimeMap.artifacts.map((s) => s.id).join(', ') || '(none)'}`);
  lines.push('');

  lines.push('## Errors');
  if (errors.length === 0) {
    lines.push('- (none)');
  } else {
    for (const e of errors) {
      lines.push(`- ${e.ts} [${e.domain}] ${e.event}: ${e.message ?? ''} (${e.eventId})`);
    }
  }
  lines.push('');

  lines.push('## Slow Operations');
  if (slow.length === 0) {
    lines.push('- (none)');
  } else {
    for (const e of slow) {
      lines.push(`- ${e.durationMs}ms [${e.domain}] ${e.event} (${e.eventId})`);
    }
  }
  lines.push('');

  lines.push('## Suggested Source Files');
  if (files.length === 0) {
    lines.push('- (no suggestions — inspect events/*.jsonl directly)');
  } else {
    for (const f of files) lines.push(`- ${f}`);
  }
  lines.push('');

  return lines.join('\n');
}

export function buildReadme(): string {
  return [
    '# Debug Bundle',
    '',
    'Read order:',
    '1. summary.agent.md — session + top findings + runtime map + errors + slow ops + suggested files.',
    '2. diagnosis.json — structured findings with evidence event ids and nextFiles.',
    '3. runtime-map.json — entity relationships (sidepanels, agentRuns, toolUses, tabs, nativeRequests, artifacts).',
    '4. events/<domain>.jsonl — one DebugBaseEvent per line, split by domain.',
    '5. artifacts/ — screenshots/, ax/, js/, tab-state/, native/ (referenced by event artifactRefs).',
    '6. raw/ — native-host.log, mcp-server.log, audit.jsonl when available.',
    '',
    'Screenshots and page content are sensitive. Share bundles with care.'
  ].join('\n');
}

const MAX_BUNDLE_BYTES = 32 * 1024 * 1024; // 32MB — Chrome allows 64MiB CRX→host; leave headroom
const MAX_EVENTS_PER_DOMAIN_TRUNCATED = 5000; // match ring buffer capacity

/**
 * Serialize a bundle for transport over Chrome native messaging (1MB limit).
 * If the full bundle exceeds the budget, events are truncated to the most
 * recent N per domain and a truncation marker is appended to the summary.
 *
 * @param bundle  the bundle to serialise
 * @param options.lightweight  when true, screenshot/annotated-screenshot binary
 *   content is stripped BEFORE the size check — the native host uses this mode
 *   so the freed budget can be spent on Go-side events and audit log it injects
 *   after receiving the response.
 */
export function serializeBundleForTransport(
  bundle: DebugBundle | null,
  options?: { lightweight?: boolean }
): string {
  if (!bundle) return JSON.stringify({ error: 'no active debug session' });

  // Lightweight mode: drop screenshot binary content upfront to free budget.
  if (options?.lightweight) {
    bundle = {
      ...bundle,
      artifacts: bundle.artifacts.map((a) =>
        a.type === 'screenshot' || a.type === 'annotated-screenshot'
          ? { ...a, content: undefined }
          : a
      ),
      summaryMarkdown:
        bundle.summaryMarkdown +
        '\n\n[screenshot image content stripped for transport — Go-side events and audit log injected by native host]'
    };
  }

  const serialized = JSON.stringify(bundle);
  if (serialized.length <= MAX_BUNDLE_BYTES) return serialized;

  const truncated: DebugBundle = {
    ...bundle,
    eventsByDomain: {} as Record<DebugDomain, DebugBaseEvent[]>
  };
  let totalKept = 0;
  for (const d of DEBUG_DOMAINS) {
    const evts = bundle.eventsByDomain[d] ?? [];
    const kept = evts.slice(-MAX_EVENTS_PER_DOMAIN_TRUNCATED);
    truncated.eventsByDomain[d] = kept;
    totalKept += kept.length;
  }
  truncated.summaryMarkdown =
    buildSummaryMarkdown(truncated) +
    `\n\n[events truncated for transport — kept ${totalKept} most recent across domains]`;

  let result = JSON.stringify(truncated);
  if (result.length > MAX_BUNDLE_BYTES) {
    // Still too big — drop screenshot image content (keep metadata + ref).
    // Text artifacts (ax-summary, js-result, ref-registry, tab-snapshot) are
    // kept because they are what the agent actually consumed.
    truncated.artifacts = truncated.artifacts.map((a) =>
      a.type === 'screenshot' || a.type === 'annotated-screenshot'
        ? { ...a, content: undefined }
        : a
    );
    truncated.summaryMarkdown +=
      '\n\n[screenshot image content dropped for transport — artifact metadata retained]';
    result = JSON.stringify(truncated);
  }
  return result;
}
