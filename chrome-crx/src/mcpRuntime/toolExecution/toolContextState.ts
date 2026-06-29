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
const PREFIX_CLEANUP_DELAY = 20000;

const groupFinalizationState = new Map<
  number,
  {
    lastActiveTabId: number;
    timer: ReturnType<typeof setTimeout> | null;
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

async function finalizeGroup(mainTabId: number): Promise<void> {
  const state = groupFinalizationState.get(mainTabId);
  if (!state) return;

  const memberIds = tabGroupManager.getGroupMemberIds(mainTabId);
  if (memberIds.length === 0) {
    groupFinalizationState.delete(mainTabId);
    return;
  }

  await tabGroupManager.clearIndicatorsForGroup(mainTabId).catch(() => {});
  await tabGroupManager.addCompletionPrefix(mainTabId).catch(() => {});
  await tabGroupManager.setGroupColor(mainTabId, chrome.tabGroups.Color.GREEN).catch(() => {});

  for (const tabId of memberIds) {
    await cdpDebugger.detachDebugger(tabId).catch(() => {});
  }

  groupFinalizationState.delete(mainTabId);
}

export function migrateGroupFinalizationState(oldMainTabId: number, newMainTabId: number): void {
  if (oldMainTabId === newMainTabId) return;
  const state = groupFinalizationState.get(oldMainTabId);
  if (!state) return;

  const existingState = groupFinalizationState.get(newMainTabId);
  if (existingState?.timer) clearTimeout(existingState.timer);

  const hadTimer = state.timer !== null;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  state.lastActiveTabId = newMainTabId;

  groupFinalizationState.delete(oldMainTabId);
  groupFinalizationState.set(newMainTabId, state);

  if (hadTimer && !hasActiveToolsInGroup(newMainTabId)) {
    state.timer = setTimeout(() => {
      if (!hasActiveToolsInGroup(newMainTabId)) {
        void finalizeGroup(newMainTabId);
      }
    }, PREFIX_CLEANUP_DELAY);
  }
}

// --- Tool context lifecycle ---

export async function startToolContext(
  tabId: number,
  toolName: string,
  requestId: string,
  errorCallback: (error: string) => void
): Promise<void> {
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
    const state = groupFinalizationState.get(mainTabId);
    if (state?.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    groupFinalizationState.set(mainTabId, {
      lastActiveTabId: tabId,
      timer: null
    });
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
  if (mainTabId !== undefined && !hasActiveToolsInGroup(mainTabId)) {
    const state = groupFinalizationState.get(mainTabId);
    if (state) {
      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        if (!hasActiveToolsInGroup(mainTabId)) {
          void finalizeGroup(mainTabId);
        }
      }, PREFIX_CLEANUP_DELAY);
    }
  } else if (mainTabId === undefined) {
    const timeout = setTimeout(async () => {
      if (!activeToolContexts.has(tabId) && pendingPrefixTimeouts.has(tabId)) {
        tabGroupManager.addCompletionPrefix(tabId).catch(() => {});
        pendingPrefixTimeouts.set(tabId, null);
        try {
          await cdpDebugger.detachDebugger(tabId);
        } catch {
          // silently fail
        }
      }
    }, PREFIX_CLEANUP_DELAY);
    pendingPrefixTimeouts.set(tabId, timeout);
  }
}

function clearPrefixForTab(tabId: number): void {
  const timeout = pendingPrefixTimeouts.get(tabId);
  if (timeout) clearTimeout(timeout);
  pendingPrefixTimeouts.delete(tabId);
  tabGroupManager.removePrefix(tabId).catch(() => {});

  const mainTabId = findGroupMainTab(tabId) ?? tabId;
  const state = groupFinalizationState.get(mainTabId);
  if (state?.timer) clearTimeout(state.timer);
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
