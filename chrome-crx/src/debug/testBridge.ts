/**
 * Test-only bridge that exposes the debug recorder to Playwright e2e tests
 * via globalThis.__superduckDebugBridge. Loaded as a side-effect of index.ts.
 * Production code never reads this; it exists so e2e specs can drive the
 * recorder from the service worker without a native-host round-trip.
 */

import {
  startDebugSession,
  stopDebugSession,
  getDebugStatus,
  exportDebugBundle,
  recordEvent,
  recordArtifact,
  resetDebugRecorder
} from './recorder';

if (typeof globalThis !== 'undefined') {
  const g = globalThis as Record<string, unknown>;
  g.__superduckDebugBridge = {
    startDebugSession,
    stopDebugSession,
    getDebugStatus,
    exportDebugBundle,
    recordEvent,
    recordArtifact,
    resetDebugRecorder
  };
}
