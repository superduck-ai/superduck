/**
 * Runtime map — entity relationships extracted from the event stream.
 *
 * The diagnosis builder and summary both consume this so an agent reading the
 * bundle can see "this toolUseId appeared in these domains, against this tab,
 * for this native request" without re-scanning raw JSONL.
 */

import type { DebugArtifact, DebugBaseEvent, DebugSessionMeta } from './schema';
import type { DebugIds } from './schema';

export interface RuntimeMapEntity {
  id: string;
  firstSeenTs: string;
  lastSeenTs: string;
  eventCount: number;
  domains: string[];
  related: Partial<DebugIds>;
  summary?: Record<string, unknown>;
}

export interface RuntimeMap {
  debugSessionId: string;
  runtimeSessionId: string;
  startedAt: string;
  endedAt?: string;
  extensionVersion: string;
  browser?: string;
  nativeHostVersion?: string;
  sidepanels: RuntimeMapEntity[];
  agentRuns: RuntimeMapEntity[];
  lightningIterations: RuntimeMapEntity[];
  toolUses: RuntimeMapEntity[];
  tabs: RuntimeMapEntity[];
  nativeRequests: RuntimeMapEntity[];
  workflowRecordings: RuntimeMapEntity[];
  artifacts: RuntimeMapEntity[];
}

type EntityKind =
  | 'sidepanel'
  | 'agentRun'
  | 'lightningIteration'
  | 'toolUse'
  | 'tab'
  | 'nativeRequest'
  | 'workflowRecording'
  | 'artifact';

interface Accumulator {
  byKey: Map<string, RuntimeMapEntity>;
  order: string[];
}

function keyFor(kind: EntityKind, id: string): string {
  return `${kind}:${id}`;
}

function accumulate(
  acc: Accumulator,
  kind: EntityKind,
  id: string | undefined,
  event: DebugBaseEvent
): void {
  if (!id) return;
  const key = keyFor(kind, id);
  let entity = acc.byKey.get(key);
  if (!entity) {
    entity = {
      id,
      firstSeenTs: event.ts,
      lastSeenTs: event.ts,
      eventCount: 0,
      domains: [],
      related: {}
    };
    acc.byKey.set(key, entity);
    acc.order.push(key);
  }
  entity.lastSeenTs = event.ts;
  entity.eventCount++;
  if (!entity.domains.includes(event.domain)) entity.domains.push(event.domain);
  for (const [k, v] of Object.entries(event.ids)) {
    if (v === undefined) continue;
    if (k === 'runtimeSessionId') continue;
    if (entity.related[k as keyof DebugIds] === undefined) {
      (entity.related as Record<string, unknown>)[k] = v;
    }
  }
  if (event.data) {
    const summaryKeys = [
      'toolName',
      'source',
      'url',
      'origin',
      'permissionMode',
      'commandType',
      'pageType',
      'errorType',
      'resultType'
    ];
    for (const k of summaryKeys) {
      if (k in event.data && entity.summary?.[k] === undefined) {
        entity.summary = entity.summary ?? {};
        entity.summary[k] = event.data[k];
      }
    }
  }
}

export function buildRuntimeMap(
  events: DebugBaseEvent[],
  artifacts: DebugArtifact[],
  session: DebugSessionMeta
): RuntimeMap {
  const acc: Accumulator = { byKey: new Map(), order: [] };
  for (const event of events) {
    accumulate(acc, 'sidepanel', event.ids.sidepanelInstanceId, event);
    accumulate(acc, 'agentRun', event.ids.agentRunId, event);
    accumulate(acc, 'lightningIteration', event.ids.lightningIterationId, event);
    accumulate(acc, 'toolUse', event.ids.toolUseId, event);
    accumulate(
      acc,
      'tab',
      event.ids.tabId !== undefined ? String(event.ids.tabId) : undefined,
      event
    );
    accumulate(acc, 'nativeRequest', event.ids.nativeRequestId, event);
    accumulate(acc, 'workflowRecording', event.ids.workflowRecordingId, event);
  }

  const artifactAcc: Accumulator = { byKey: new Map(), order: [] };
  for (const a of artifacts) {
    const fakeEvent: DebugBaseEvent = {
      schemaVersion: 1,
      eventId: a.id,
      ts: a.createdAt,
      debugSessionId: session.debugSessionId,
      domain: 'diagnosis',
      event: 'artifact',
      level: 'info',
      ids: a.ids,
      data: { type: a.type, mimeType: a.mimeType, byteLength: a.byteLength }
    };
    accumulate(artifactAcc, 'artifact', a.id, fakeEvent);
  }

  const collect = (kind: EntityKind): RuntimeMapEntity[] => {
    const out: RuntimeMapEntity[] = [];
    for (const key of acc.order) {
      if (key.startsWith(`${kind}:`)) {
        out.push(acc.byKey.get(key)!);
      }
    }
    return out;
  };

  return {
    debugSessionId: session.debugSessionId,
    runtimeSessionId: session.runtimeSessionId,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    extensionVersion: session.extensionVersion,
    browser: session.browser,
    nativeHostVersion: session.nativeHostVersion,
    sidepanels: collect('sidepanel'),
    agentRuns: collect('agentRun'),
    lightningIterations: collect('lightningIteration'),
    toolUses: collect('toolUse'),
    tabs: collect('tab'),
    nativeRequests: collect('nativeRequest'),
    workflowRecordings: collect('workflowRecording'),
    artifacts: [...artifactAcc.byKey.values()]
  };
}
