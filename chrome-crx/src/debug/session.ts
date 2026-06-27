/**
 * Runtime + debug session identity.
 *
 * `runtimeSessionId` identifies a single JS context lifetime (service worker,
 * sidepanel, content script). Each context lazily generates its own so events
 * can be attributed to the context that produced them.
 *
 * `debugSessionId` identifies one debug recording window, shared across
 * contexts via the store so a sidepanel and service worker contribute to the
 * same bundle.
 */

let runtimeSessionId: string | null = null;

function generateId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) {
    try {
      return c.randomUUID();
    } catch {
      // fall through
    }
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function getRuntimeSessionId(): string {
  if (runtimeSessionId) return runtimeSessionId;
  runtimeSessionId = generateId();
  return runtimeSessionId;
}

/** Test-only: force a fresh runtime session id on next access. */
export function resetRuntimeSessionId(): void {
  runtimeSessionId = null;
}

export function newDebugSessionId(): string {
  return generateId();
}
