import { StorageKeys, getStorageValue, setStorageValue } from '../../extensionServices';
import { cdpDebugger } from '../browserAutomation';
import { tabGroupManager } from '../tabState';

type PersistedActiveToolContext = {
  toolName: string;
  requestId: string;
  startTime: number;
};

export type ActiveToolContext = {
  toolName: string;
  requestId: string;
  startTime: number;
  errorCallback?: (error: string) => void;
};

const activeToolContexts = new Map<number, ActiveToolContext>();

const pendingPrefixTimeouts = new Map<number, ReturnType<typeof setTimeout> | null>();
const pendingDebuggerTimeouts = new Map<number, ReturnType<typeof setTimeout> | null>();
const PREFIX_CLEANUP_DELAY = 20000;
// Debuggers are detached lazily: "thinking" pauses between tool calls must not
// tear down the CDP session (re-attaching is slow and re-flashes Chrome's
// debugging info-bar). Explicit finalize detaches immediately via
// releaseToolContextsForTabs.
const DEBUGGER_IDLE_DETACH_DELAY = 5 * 60 * 1000;

const groupFinalizationState = new Map<
  number,
  {
    lastActiveTabId: number;
    timer: ReturnType<typeof setTimeout> | null;
    detachTimer: ReturnType<typeof setTimeout> | null;
  }
>();

// --- Read accessors for cross-module consumers (navigationGuard, permissionPrompt) ---

export function hasActiveToolContext(tabId: number): boolean {
  return activeToolContexts.has(tabId);
}

export function getActiveToolContext(tabId: number): ActiveToolContext | undefined {
  return activeToolContexts.get(tabId);
}

export function getPendingPrefixTimeout(
  tabId: number
): ReturnType<typeof setTimeout> | null | undefined {
  return pendingPrefixTimeouts.get(tabId);
}

export function setPendingPrefixTimeout(
  tabId: number,
  timeout: ReturnType<typeof setTimeout> | null
): void {
  pendingPrefixTimeouts.set(tabId, timeout);
}

function clearPendingDebuggerTimeout(tabId: number): void {
  const timeout = pendingDebuggerTimeouts.get(tabId);
  if (timeout) clearTimeout(timeout);
  pendingDebuggerTimeouts.delete(tabId);
}

// --- Serialization / persistence ---

/**
 * Serialize the active tool contexts Map into a plain record keyed by tabId.
 * `errorCallback` is a function and intentionally not persisted — after an SW
 * restart the callback is gone and any tool that errors out before completing
 * will simply not surface a UI error; the tool itself is allowed to finish.
 */
function serializeActiveToolContexts(): Record<string, PersistedActiveToolContext> {
  const out: Record<string, PersistedActiveToolContext> = {};
  for (const [tabId, ctx] of activeToolContexts) {
    out[String(tabId)] = {
      toolName: ctx.toolName,
      requestId: ctx.requestId,
      startTime: ctx.startTime
    };
  }
  return out;
}

async function persistActiveToolContexts(): Promise<void> {
  try {
    await setStorageValue(StorageKeys.ACTIVE_TOOL_CONTEXTS, serializeActiveToolContexts());
  } catch (err) {
    console.warn('[core] failed to persist activeToolContexts', err);
  }
}

/**
 * Restore the active tool contexts map from storage. Called from
 * `service-worker.ts` on `chrome.runtime.onStartup` so the in-memory Map
 * survives a service worker restart and the
 * `webNavigation.onBeforeNavigate` category interceptor keeps blocking
 * forbidden-domain navigations even after the SW is killed and respawned.
 *
 * `errorCallback` is not persisted (functions cannot cross the
 * serialization boundary); tools that error out before completing after an
 * SW restart will not surface a UI error, but the tool itself is allowed
 * to finish and the bookkeeping is intact.
 */
export async function restoreActiveToolContextsFromStorage(): Promise<void> {
  try {
    const stored = await getStorageValue<Record<string, PersistedActiveToolContext>>(
      StorageKeys.ACTIVE_TOOL_CONTEXTS
    );
    if (!stored) return;
    for (const [tabIdStr, ctx] of Object.entries(stored)) {
      const tabId = Number(tabIdStr);
      if (!Number.isInteger(tabId)) continue;
      activeToolContexts.set(tabId, { ...ctx });
    }
  } catch (err) {
    console.warn('[core] failed to restore activeToolContexts', err);
  }
}

// --- Group finalization ---

function findGroupMainTab(tabId: number): number | undefined {
  return tabGroupManager.findMainTabIdSync(tabId);
}

function hasActiveToolsInGroup(mainTabId: number): boolean {
  const memberIds = tabGroupManager.getGroupMemberIds(mainTabId);
  for (const memberId of memberIds) {
    if (activeToolContexts.has(memberId)) return true;
  }
  return false;
}

/**
 * Idle ≠ done. The agent is often just "thinking" between tool calls (this can
 * take minutes), so an idle group must NOT be decorated as completed: no ✅
 * prefix, no GREEN color. We only clear the per-tab visual indicators so the
 * user is not locked out of the pages while the agent thinks. GREEN + ✅ are
 * applied exclusively on explicit completion signals: tabs_finalize_mcp
 * (tabGroupFinalize.markGroupCompleted) or sidepanel turn completion
 * (staticIndicator).
 */
async function cleanupIdleGroupIndicators(mainTabId: number): Promise<void> {
  await tabGroupManager.clearIndicatorsForGroup(mainTabId).catch(() => {});
}

async function detachIdleDebuggers(mainTabId: number, memberSnapshot: number[]): Promise<void> {
  // Group metadata may have been rekeyed or removed (e.g. by finalize) since
  // the timer was scheduled, so detach the union of the snapshot and the
  // current membership.
  const tabIds = new Set([...memberSnapshot, ...tabGroupManager.getGroupMemberIds(mainTabId)]);
  for (const tabId of tabIds) {
    if (activeToolContexts.has(tabId)) continue;
    await cdpDebugger.detachDebugger(tabId).catch(() => {});
  }
  const state = groupFinalizationState.get(mainTabId);
  if (state && state.timer === null && state.detachTimer === null) {
    groupFinalizationState.delete(mainTabId);
  }
}

function clearGroupTimers(state: {
  timer: ReturnType<typeof setTimeout> | null;
  detachTimer: ReturnType<typeof setTimeout> | null;
}): void {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (state.detachTimer) {
    clearTimeout(state.detachTimer);
    state.detachTimer = null;
  }
}

function scheduleIdleCleanup(mainTabId: number): void {
  const state = groupFinalizationState.get(mainTabId);
  if (!state) return;
  clearGroupTimers(state);
  const memberSnapshot = tabGroupManager.getGroupMemberIds(mainTabId);
  state.timer = setTimeout(() => {
    state.timer = null;
    if (!hasActiveToolsInGroup(mainTabId)) {
      void cleanupIdleGroupIndicators(mainTabId);
    }
  }, PREFIX_CLEANUP_DELAY);
  state.detachTimer = setTimeout(() => {
    state.detachTimer = null;
    if (!hasActiveToolsInGroup(mainTabId)) {
      void detachIdleDebuggers(mainTabId, memberSnapshot);
    }
  }, DEBUGGER_IDLE_DETACH_DELAY);
}

export function migrateGroupFinalizationState(oldMainTabId: number, newMainTabId: number): void {
  if (oldMainTabId === newMainTabId) return;
  const state = groupFinalizationState.get(oldMainTabId);
  if (!state) return;

  const existingState = groupFinalizationState.get(newMainTabId);
  if (existingState) clearGroupTimers(existingState);

  const hadTimers = state.timer !== null || state.detachTimer !== null;
  clearGroupTimers(state);
  state.lastActiveTabId = newMainTabId;

  groupFinalizationState.delete(oldMainTabId);
  groupFinalizationState.set(newMainTabId, state);

  if (hadTimers && !hasActiveToolsInGroup(newMainTabId)) {
    scheduleIdleCleanup(newMainTabId);
  }
}

// --- Tool context lifecycle ---

export async function startToolContext(
  tabId: number,
  toolName: string,
  requestId: string,
  errorCallback: (error: string) => void
): Promise<void> {
  clearPendingDebuggerTimeout(tabId);
  activeToolContexts.set(tabId, {
    toolName,
    requestId,
    startTime: Date.now(),
    errorCallback
  });
  void persistActiveToolContexts();
  await tabGroupManager.addTabToIndicatorGroup({
    tabId,
    isRunning: true,
    isMcp: true
  });

  const mainTabId = findGroupMainTab(tabId);
  if (mainTabId !== undefined) {
    // A new tool call makes the group active again: cancel any pending idle
    // cleanup (indicator clear / debugger detach) and reassert ORANGE so a
    // previous explicit-completion GREEN is cleared for the new turn.
    const existing = groupFinalizationState.get(mainTabId);
    if (existing) {
      clearGroupTimers(existing);
      existing.lastActiveTabId = tabId;
    } else {
      groupFinalizationState.set(mainTabId, {
        lastActiveTabId: tabId,
        timer: null,
        detachTimer: null
      });
    }
    tabGroupManager.setGroupColor(mainTabId, chrome.tabGroups.Color.ORANGE).catch(() => {});
  }

  if (pendingPrefixTimeouts.has(tabId)) {
    const existingTimeout = pendingPrefixTimeouts.get(tabId);
    if (existingTimeout) clearTimeout(existingTimeout);
    tabGroupManager.addLoadingPrefix(tabId).catch(() => {});
    pendingPrefixTimeouts.set(tabId, null);
  } else {
    tabGroupManager.addLoadingPrefix(tabId).catch(() => {});
    pendingPrefixTimeouts.set(tabId, null);
  }
}

export function cleanupAfterToolExecution(tabId: number, _clientId?: string): void {
  if (!activeToolContexts.has(tabId)) return;

  activeToolContexts.delete(tabId);
  void persistActiveToolContexts();

  const mainTabId = findGroupMainTab(tabId);
  if (mainTabId !== undefined) {
    // Grouped tab went idle. Idle ≠ done (the agent is often just "thinking"
    // between tool calls, sometimes for minutes), so do NOT decorate the
    // group as completed: schedule a gentle indicator clear + lazy debugger
    // detach only. GREEN + ✅ come exclusively from an explicit finalize
    // (tabGroupFinalize.markGroupCompleted) or sidepanel turn end.
    if (!hasActiveToolsInGroup(mainTabId)) {
      if (!groupFinalizationState.has(mainTabId)) {
        groupFinalizationState.set(mainTabId, {
          lastActiveTabId: tabId,
          timer: null,
          detachTimer: null
        });
      }
      scheduleIdleCleanup(mainTabId);
    }
    return;
  }

  // Ungrouped tab went idle: the same "idle ≠ done" rule applies. Clear its
  // indicator promptly so the page stays usable, and detach the debugger
  // lazily. No completion decoration — there is no group to decorate.
  const idleIndicatorTimer = setTimeout(() => {
    if (!activeToolContexts.has(tabId)) {
      tabGroupManager.hideAgentIndicatorsForTab(tabId).catch(() => {});
    }
  }, PREFIX_CLEANUP_DELAY);
  pendingPrefixTimeouts.set(tabId, idleIndicatorTimer);
  const debuggerDetachTimer = setTimeout(() => {
    pendingDebuggerTimeouts.delete(tabId);
    if (!activeToolContexts.has(tabId)) cdpDebugger.detachDebugger(tabId).catch(() => {});
  }, DEBUGGER_IDLE_DETACH_DELAY);
  pendingDebuggerTimeouts.set(tabId, debuggerDetachTimer);
}

function clearPrefixForTab(tabId: number): void {
  const timeout = pendingPrefixTimeouts.get(tabId);
  if (timeout) clearTimeout(timeout);
  pendingPrefixTimeouts.delete(tabId);
  clearPendingDebuggerTimeout(tabId);
  tabGroupManager.removePrefix(tabId).catch(() => {});

  const mainTabId = findGroupMainTab(tabId) ?? tabId;
  const state = groupFinalizationState.get(mainTabId);
  if (state) clearGroupTimers(state);
  groupFinalizationState.delete(mainTabId);
}

export async function resetMcpState(): Promise<void> {
  try {
    const groups = await tabGroupManager.getAllGroups();
    for (const group of groups) {
      clearPrefixForTab(group.mainTabId);
    }
  } catch {
    // silently fail
  }
}
