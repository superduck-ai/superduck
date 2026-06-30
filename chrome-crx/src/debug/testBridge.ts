/**
 * Test-only bridge that exposes the debug recorder to Playwright e2e tests
 * via globalThis.__superduckDebugBridge. Loaded as a side-effect of index.ts.
 * Production code never reads this; it exists so e2e specs can drive the
 * recorder from the service worker without a native-host round-trip.
 *
 * realAttachDebugger / realTakeSnapshot read production singletons off
 * globalThis (populated by cdp/index.ts and axSnapshot/index.ts) rather than
 * importing them — a static import here would create a debug → mcpRuntime
 * circular dependency that breaks every test that mocks ../cdp.
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
import { serializeBundleForTransport } from './exportBundle';

if (typeof globalThis !== 'undefined') {
  const g = globalThis as Record<string, unknown>;
  g.__superduckDebugBridge = {
    startDebugSession,
    stopDebugSession,
    getDebugStatus,
    exportDebugBundle,
    recordEvent,
    recordArtifact,
    resetDebugRecorder,
    serializeBundleForTransport,
    realAttachDebugger: (tabId: number) => {
      const dbg = (
        globalThis as { __superduckCdpDebugger?: { attachDebugger: (t: number) => Promise<void> } }
      ).__superduckCdpDebugger;
      if (!dbg) throw new Error('cdpDebugger not registered on globalThis');
      return dbg.attachDebugger(tabId);
    },
    realTakeSnapshot: (tabId: number) => {
      const snap = (globalThis as { __superduckTakeSnapshot?: (t: number) => Promise<unknown> })
        .__superduckTakeSnapshot;
      if (!snap) throw new Error('takeSnapshot not registered on globalThis');
      return snap(tabId);
    }
  };
}
