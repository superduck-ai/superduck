/**
 * Debug evidence schema — shared types for the local debug system.
 *
 * Every event recorded by the debug recorder conforms to DebugBaseEvent. The
 * schema is intentionally wide (ids + data bag) so each runtime domain can
 * attach the fields it cares about without forcing a union of narrow shapes.
 * Domain-specific event names live at the call site, not here.
 */

export const DEBUG_SCHEMA_VERSION = 1 as const;

export type DebugDomain =
  | 'sidepanel'
  | 'agent-loop'
  | 'lightning'
  | 'tool-runtime'
  | 'permission'
  | 'tab-state'
  | 'cdp'
  | 'input'
  | 'screenshot-ref'
  | 'javascript'
  | 'workflow-recording'
  | 'native-bridge'
  | 'cli'
  | 'mcp-server'
  | 'diagnosis';

export const DEBUG_DOMAINS: readonly DebugDomain[] = [
  'sidepanel',
  'agent-loop',
  'lightning',
  'tool-runtime',
  'permission',
  'tab-state',
  'cdp',
  'input',
  'screenshot-ref',
  'javascript',
  'workflow-recording',
  'native-bridge',
  'cli',
  'mcp-server',
  'diagnosis'
];

export type DebugLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Correlation ids. Any event may carry any subset; domains populate the ids
 * that make sense for their flow so the diagnosis builder can stitch a
 * cross-domain narrative (e.g. nativeRequestId -> toolUseId -> tabId).
 */
export interface DebugIds {
  runtimeSessionId?: string;
  sidepanelInstanceId?: string;
  conversationUuid?: string;
  agentRunId?: string;
  lightningIterationId?: string;
  toolUseId?: string;
  requestId?: string;
  nativeRequestId?: string;
  workflowRecordingId?: string;
  tabId?: number;
  tabGroupId?: number;
  mcpTabGroupId?: number;
  operationId?: string;
}

export type DebugArtifactType =
  | 'screenshot'
  | 'annotated-screenshot'
  | 'ax-summary'
  | 'ref-registry'
  | 'js-result'
  | 'tab-snapshot'
  | 'native-status'
  | 'text';

export interface DebugArtifactRef {
  id: string;
  type: DebugArtifactType;
}

export interface DebugBaseEvent {
  schemaVersion: typeof DEBUG_SCHEMA_VERSION;
  eventId: string;
  ts: string;
  monotonicMs?: number;
  debugSessionId: string;
  domain: DebugDomain;
  event: string;
  level: DebugLevel;
  ids: DebugIds;
  data?: Record<string, unknown>;
  artifactRefs?: DebugArtifactRef[];
  durationMs?: number;
  error?: { message: string; name?: string; stack?: string };
}

export interface DebugArtifact {
  id: string;
  type: DebugArtifactType;
  createdAt: string;
  ids: DebugIds;
  mimeType: string;
  byteLength: number;
  sha256: string;
  redacted: boolean;
  path?: string;
  data?: unknown;
  content?: unknown;
  truncated?: boolean;
}

export interface DebugSessionMeta {
  debugSessionId: string;
  runtimeSessionId: string;
  startedAt: string;
  endedAt?: string;
  extensionVersion: string;
  browser?: string;
  nativeHostVersion?: string;
  eventCount: number;
  artifactCount: number;
  note?: string;
}
