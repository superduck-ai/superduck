/**
 * Public entry point for the local debug evidence system.
 *
 * Domains call `recordEvent` / `withDebugSpan` / `recordArtifact`. Collectors
 * call `exportDebugBundle`. Everything else is internal.
 */

export * from './schema';
export * from './redaction';
export * from './ringBuffer';
export * from './store';
export * from './session';
export {
  isDebugEnabled,
  getDebugSession,
  getDebugStatus,
  getDebugStore,
  getRedactionOptions,
  startDebugSession,
  stopDebugSession,
  setPersistentDebug,
  enableDebugEverywhere,
  disableDebugEverywhere,
  getDebugStatusFromStorage,
  recordEvent,
  recordError,
  recordArtifact,
  withDebugSpan,
  getRingBufferEvents,
  getEvents,
  getEventsByDomain,
  getArtifacts,
  getArtifactContent,
  exportDebugBundle,
  resetDebugRecorder,
  type DebugEventInput,
  type StartDebugSessionOptions,
  type RecordArtifactInput,
  type DebugStatus
} from './recorder';
export { buildRuntimeMap, type RuntimeMap, type RuntimeMapEntity } from './runtimeMap';
export {
  diagnose,
  type DiagnosisResult,
  type DiagnosisFinding,
  type DiagnosisSeverity
} from './diagnostics';
export {
  buildBundle,
  buildSummaryMarkdown,
  buildReadme,
  groupEventsByDomain,
  serializeBundleForTransport,
  type DebugBundle
} from './exportBundle';

import './testBridge';
