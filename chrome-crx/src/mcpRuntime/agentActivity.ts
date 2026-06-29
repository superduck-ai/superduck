import { StorageKeys, getStorageValue, setStorageValue } from '../extensionServices';

let activeToolCount = 0;
let onAgentBecameIdleCallback: (() => void) | null = null;

export function isAgentActive(): boolean {
  return activeToolCount > 0;
}

export function setOnAgentBecameIdle(cb: (() => void) | null): void {
  onAgentBecameIdleCallback = cb;
}

export function beginTool(): void {
  activeToolCount++;
  void persistActiveToolCount();
}

export function endTool(): void {
  activeToolCount--;
  if (activeToolCount <= 0) {
    activeToolCount = 0;
  }
  void persistActiveToolCount();
  if (activeToolCount === 0) {
    onAgentBecameIdleCallback?.();
  }
}

/**
 * Persist the active tool count to storage so it survives an SW restart.
 * `service-worker.ts` reads this back in `onStartup` to make
 * `isAgentActive()` return the right value across restarts and prevent
 * `tryApplyUpdate` from reloading Chrome into a running agent.
 *
 * The on-disk count is treated as a backup; the in-memory `activeToolCount`
 * is the source of truth at runtime. Storage writes are fire-and-forget —
 * we only need eventual consistency.
 */
async function persistActiveToolCount(): Promise<void> {
  try {
    await setStorageValue(StorageKeys.ACTIVE_TOOL_COUNT, activeToolCount);
  } catch (err) {
    console.warn('[core] failed to persist activeToolCount', err);
  }
}

/**
 * Restore the in-memory `activeToolCount` from storage. Called from
 * `service-worker.ts` on `chrome.runtime.onStartup`. If no value is
 * present (fresh install or pre-fix migration), defaults to 0.
 */
export async function restoreActiveToolCountFromStorage(): Promise<void> {
  try {
    const stored = await getStorageValue<number>(StorageKeys.ACTIVE_TOOL_COUNT);
    if (typeof stored === 'number' && Number.isFinite(stored) && stored >= 0) {
      activeToolCount = Math.floor(stored);
    } else {
      activeToolCount = 0;
    }
  } catch (err) {
    console.warn('[core] failed to restore activeToolCount', err);
    activeToolCount = 0;
  }
}
