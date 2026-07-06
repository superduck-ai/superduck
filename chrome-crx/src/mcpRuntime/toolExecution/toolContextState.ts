import { StorageKeys, getStorageValue, setStorageValue } from '../../extensionServices';
import { PersistentDeadlineStore, type DeadlineState } from '../../utils/persistentDeadlineStore';
import { cdpDebugger } from '../browserAutomation';
import { tabGroupManager } from '../tabState';

type PersistedActiveToolContext = {
  toolName: string;
  requestId: string;
  startTime: number;
};

const TOOL_CONTEXT_DEADLINE_KINDS = [
  'idleCleanup',
  'debuggerDetach',
  'activeContextExpiry'
] as const;

type ToolContextDeadlineKind = (typeof TOOL_CONTEXT_DEADLINE_KINDS)[number];

type ToolContextDeadlineTarget = 'group' | 'tab';

type PersistedToolContextDeadline = {
  targetType: ToolContextDeadlineTarget;
  targetId: number;
  dueAt: number;
  memberSnapshot?: number[];
};

type PersistedToolContextDeadlines = Record<
  ToolContextDeadlineKind,
  Record<string, PersistedToolContextDeadline>
>;

export type ActiveToolContext = {
  toolName: string;
  requestId: string;
  startTime: number;
  errorCallback?: (error: string) => void;
};

const activeToolContexts = new Map<number, ActiveToolContext>();

const pendingPrefixTimeouts = new Map<number, ReturnType<typeof setTimeout> | null>();
const pendingDebuggerTimeouts = new Map<number, ReturnType<typeof setTimeout> | null>();
const pendingActiveContextExpiryTimeouts = new Map<number, ReturnType<typeof setTimeout> | null>();
const PREFIX_CLEANUP_DELAY = 20000;
// Debuggers are detached lazily: "thinking" pauses between tool calls must not
// tear down the CDP session (re-attaching is slow and re-flashes Chrome's
// debugging info-bar). The lazy detach deadline is persisted so a service-worker
// restart can still close stale CDP sessions.
const DEBUGGER_IDLE_DETACH_DELAY = 5 * 60 * 1000;
export const ACTIVE_TOOL_CONTEXT_TTL_MS = 5 * 60 * 1000;
const TOOL_CONTEXT_ALARM_PREFIX = 'superduck.toolContext.';
const EMPTY_DEADLINES: PersistedToolContextDeadlines = {
  idleCleanup: {},
  debuggerDetach: {},
  activeContextExpiry: {}
};

const deadlineStore = new PersistentDeadlineStore<
  ToolContextDeadlineKind,
  PersistedToolContextDeadline
>({
  storageKey: StorageKeys.TOOL_CONTEXT_DEADLINES,
  kinds: TOOL_CONTEXT_DEADLINE_KINDS,
  emptyState: EMPTY_DEADLINES,
  loadState: loadToolContextDeadlineState,
  warnLabel: 'tool context deadlines'
});

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPersistedActiveToolContext(value: unknown): value is PersistedActiveToolContext {
  if (!isRecord(value)) return false;
  return (
    typeof value.toolName === 'string' &&
    typeof value.requestId === 'string' &&
    typeof value.startTime === 'number' &&
    Number.isFinite(value.startTime)
  );
}

function deadlineKey(targetType: ToolContextDeadlineTarget, targetId: number): string {
  return `${targetType}:${targetId}`;
}

function parseDeadlineKey(key: string): {
  targetType: ToolContextDeadlineTarget;
  targetId: number;
} | null {
  const [targetType, rawTargetId] = key.split(':');
  const targetId = Number(rawTargetId);
  if ((targetType !== 'group' && targetType !== 'tab') || !Number.isInteger(targetId)) return null;
  return { targetType, targetId };
}

function deadlineAlarmName(kind: ToolContextDeadlineKind, key: string): string {
  return `${TOOL_CONTEXT_ALARM_PREFIX}${kind}:${key}`;
}

function parseDeadlineAlarmName(alarmName: string):
  | {
      kind: ToolContextDeadlineKind;
      key: string;
    }
  | undefined {
  if (!alarmName.startsWith(TOOL_CONTEXT_ALARM_PREFIX)) return undefined;
  const rest = alarmName.slice(TOOL_CONTEXT_ALARM_PREFIX.length);
  const separator = rest.indexOf(':');
  if (separator <= 0) return undefined;
  const kind = rest.slice(0, separator);
  const key = rest.slice(separator + 1);
  if (!TOOL_CONTEXT_DEADLINE_KINDS.includes(kind as ToolContextDeadlineKind)) return undefined;
  if (!parseDeadlineKey(key)) return undefined;
  return { kind: kind as ToolContextDeadlineKind, key };
}

function isPersistedDeadline(value: unknown): value is PersistedToolContextDeadline {
  if (!isRecord(value)) return false;
  if (value.targetType !== 'group' && value.targetType !== 'tab') return false;
  if (typeof value.targetId !== 'number' || !Number.isInteger(value.targetId)) return false;
  if (typeof value.dueAt !== 'number' || !Number.isFinite(value.dueAt)) return false;
  if (
    value.memberSnapshot !== undefined &&
    (!Array.isArray(value.memberSnapshot) ||
      !value.memberSnapshot.every((tabId) => typeof tabId === 'number' && Number.isInteger(tabId)))
  ) {
    return false;
  }
  return true;
}

function loadToolContextDeadlineState(
  stored: unknown
): DeadlineState<ToolContextDeadlineKind, PersistedToolContextDeadline> {
  const next: PersistedToolContextDeadlines = {
    idleCleanup: {},
    debuggerDetach: {},
    activeContextExpiry: {}
  };
  if (!isRecord(stored)) return next;
  for (const kind of TOOL_CONTEXT_DEADLINE_KINDS) {
    const byKey = stored[kind];
    if (!isRecord(byKey)) continue;
    for (const [key, value] of Object.entries(byKey)) {
      if (!parseDeadlineKey(key) || !isPersistedDeadline(value)) continue;
      if (kind === 'activeContextExpiry' && value.targetType !== 'tab') continue;
      next[kind][key] = {
        targetType: value.targetType,
        targetId: value.targetId,
        dueAt: value.dueAt,
        ...(value.memberSnapshot ? { memberSnapshot: [...value.memberSnapshot] } : {})
      };
    }
  }
  return next;
}

function clearDeadlineAlarm(kind: ToolContextDeadlineKind, key: string): void {
  try {
    if (typeof chrome === 'undefined') return;
    chrome.alarms?.clear?.(deadlineAlarmName(kind, key));
  } catch {
    // alarms are unavailable in some unit-test shims
  }
}

function armDeadlineAlarm(kind: ToolContextDeadlineKind, key: string, dueAt: number): void {
  try {
    if (typeof chrome === 'undefined') return;
    chrome.alarms?.create?.(deadlineAlarmName(kind, key), {
      when: Math.max(Date.now() + 1, dueAt)
    });
  } catch {
    // setTimeout remains the in-lifetime fallback
  }
}

function clearDeadlineTimer(
  kind: ToolContextDeadlineKind,
  record: PersistedToolContextDeadline
): void {
  if (record.targetType === 'tab') {
    if (kind === 'idleCleanup') {
      const pendingPrefixTimeout = pendingPrefixTimeouts.get(record.targetId);
      if (pendingPrefixTimeout) clearTimeout(pendingPrefixTimeout);
      pendingPrefixTimeouts.delete(record.targetId);
    } else if (kind === 'debuggerDetach') {
      clearPendingDebuggerTimeout(record.targetId);
    } else {
      const expiryTimeout = pendingActiveContextExpiryTimeouts.get(record.targetId);
      if (expiryTimeout) clearTimeout(expiryTimeout);
      pendingActiveContextExpiryTimeouts.delete(record.targetId);
    }
    return;
  }

  if (kind === 'activeContextExpiry') return;

  const state = groupFinalizationState.get(record.targetId);
  if (!state) return;
  if (kind === 'idleCleanup') {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
  } else {
    if (state.detachTimer) clearTimeout(state.detachTimer);
    state.detachTimer = null;
  }
}

function removeStoredDeadline(
  kind: ToolContextDeadlineKind,
  record: PersistedToolContextDeadline
): void {
  const key = deadlineKey(record.targetType, record.targetId);
  deadlineStore.remove(kind, key);
  clearDeadlineAlarm(kind, key);
  clearDeadlineTimer(kind, record);
}

function setStoredDeadline(
  kind: ToolContextDeadlineKind,
  record: PersistedToolContextDeadline
): void {
  const key = deadlineKey(record.targetType, record.targetId);
  deadlineStore.set(kind, key, record);
  armDeadlineAlarm(kind, key, record.dueAt);
}

function clearStoredDeadlinesForTarget(
  targetType: ToolContextDeadlineTarget,
  targetId: number
): void {
  const key = deadlineKey(targetType, targetId);
  for (const [kind, , record] of deadlineStore.removeWhere(
    (candidateKind, candidateKey) =>
      candidateKey === key && TOOL_CONTEXT_DEADLINE_KINDS.includes(candidateKind)
  )) {
    clearDeadlineAlarm(kind, key);
    clearDeadlineTimer(kind, record);
  }
}

async function tabExists(tabId: number): Promise<boolean> {
  try {
    if (typeof chrome === 'undefined') return false;
    await chrome.tabs.get(tabId);
    return true;
  } catch {
    return false;
  }
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

async function rearmRestoredActiveToolContexts(): Promise<void> {
  for (const [tabId, ctx] of activeToolContexts.entries()) {
    const mainTabId = findGroupMainTab(tabId);
    const deadline: PersistedToolContextDeadline = {
      targetType: 'tab',
      targetId: tabId,
      dueAt: ctx.startTime + ACTIVE_TOOL_CONTEXT_TTL_MS,
      memberSnapshot:
        mainTabId !== undefined ? [tabId, ...tabGroupManager.getGroupMemberIds(mainTabId)] : [tabId]
    };
    setStoredDeadline('activeContextExpiry', deadline);
    armDeadlineTimeout('activeContextExpiry', deadline);

    await tabGroupManager
      .addTabToIndicatorGroup({ tabId, isRunning: true, isMcp: true })
      .catch(() => {});
    await tabGroupManager.addLoadingPrefix(tabId).catch(() => {});
    if (mainTabId !== undefined) {
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
      const orange = typeof chrome !== 'undefined' ? chrome.tabGroups?.Color?.ORANGE : undefined;
      if (orange) await tabGroupManager.setGroupColor(mainTabId, orange).catch(() => {});
    }
  }
}

/**
 * Restore active tool contexts from storage on every service-worker cold start,
 * not only browser startup. Entries are treated as short-lived recovery hints:
 * if the tab disappeared or the context is older than the max native tool
 * timeout, it is stale and must not brick page indicators after a restart.
 */
export async function restoreActiveToolContextsFromStorage(): Promise<void> {
  try {
    deadlineStore.reset();
    const stored = await getStorageValue<Record<string, PersistedActiveToolContext>>(
      StorageKeys.ACTIVE_TOOL_CONTEXTS
    );
    activeToolContexts.clear();
    let changed = false;
    if (!isRecord(stored)) {
      if (stored !== undefined) await persistActiveToolContexts();
      await restoreToolContextDeadlinesFromStorage();
      await rearmRestoredActiveToolContexts();
      return;
    }
    const now = Date.now();
    for (const [tabIdStr, ctx] of Object.entries(stored)) {
      const tabId = Number(tabIdStr);
      if (!Number.isInteger(tabId) || !isPersistedActiveToolContext(ctx)) {
        changed = true;
        continue;
      }
      if (now - ctx.startTime > ACTIVE_TOOL_CONTEXT_TTL_MS || !(await tabExists(tabId))) {
        changed = true;
        continue;
      }
      activeToolContexts.set(tabId, { ...ctx });
    }
    if (changed) void persistActiveToolContexts();
  } catch (err) {
    console.warn('[core] failed to restore activeToolContexts', err);
  }
  await restoreToolContextDeadlinesFromStorage();
  await rearmRestoredActiveToolContexts();
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
  await Promise.allSettled(
    [...tabIds]
      .filter((tabId) => !activeToolContexts.has(tabId))
      .map((tabId) => cdpDebugger.detachDebugger(tabId))
  );
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

function sameDeadline(
  left: PersistedToolContextDeadline | undefined,
  right: PersistedToolContextDeadline
): boolean {
  return (
    !!left &&
    left.targetType === right.targetType &&
    left.targetId === right.targetId &&
    left.dueAt === right.dueAt
  );
}

function ensureGroupFinalizationState(mainTabId: number): {
  lastActiveTabId: number;
  timer: ReturnType<typeof setTimeout> | null;
  detachTimer: ReturnType<typeof setTimeout> | null;
} {
  let state = groupFinalizationState.get(mainTabId);
  if (!state) {
    state = {
      lastActiveTabId: mainTabId,
      timer: null,
      detachTimer: null
    };
    groupFinalizationState.set(mainTabId, state);
  }
  return state;
}

function markDeadlineTimerDone(
  kind: ToolContextDeadlineKind,
  record: PersistedToolContextDeadline
): void {
  if (record.targetType === 'tab') {
    if (kind === 'idleCleanup') pendingPrefixTimeouts.delete(record.targetId);
    else if (kind === 'debuggerDetach') pendingDebuggerTimeouts.delete(record.targetId);
    else pendingActiveContextExpiryTimeouts.delete(record.targetId);
    return;
  }
  if (kind === 'activeContextExpiry') return;
  const state = groupFinalizationState.get(record.targetId);
  if (!state) return;
  if (kind === 'idleCleanup') state.timer = null;
  else state.detachTimer = null;
}

function cleanupEmptyGroupState(mainTabId: number): void {
  const state = groupFinalizationState.get(mainTabId);
  if (state && state.timer === null && state.detachTimer === null) {
    groupFinalizationState.delete(mainTabId);
  }
}

async function processToolContextDeadline(
  kind: ToolContextDeadlineKind,
  record: PersistedToolContextDeadline
): Promise<void> {
  const key = deadlineKey(record.targetType, record.targetId);
  if (!sameDeadline(deadlineStore.get(kind, key), record)) return;
  markDeadlineTimerDone(kind, record);

  if (kind === 'activeContextExpiry') {
    if (record.targetType === 'tab' && activeToolContexts.has(record.targetId)) {
      activeToolContexts.delete(record.targetId);
      void persistActiveToolContexts();
      await tabGroupManager.removePrefix(record.targetId).catch(() => {});
      if (activeToolContexts.has(record.targetId)) {
        await tabGroupManager
          .addTabToIndicatorGroup({ tabId: record.targetId, isRunning: true, isMcp: true })
          .catch(() => {});
        await tabGroupManager.addLoadingPrefix(record.targetId).catch(() => {});
        return;
      }
      await tabGroupManager.hideAgentIndicatorsForTab(record.targetId).catch(() => {});

      const mainTabId = findGroupMainTab(record.targetId);
      if (mainTabId !== undefined && !hasActiveToolsInGroup(mainTabId)) {
        await cleanupIdleGroupIndicators(mainTabId);
        await detachIdleDebuggers(mainTabId, record.memberSnapshot ?? [record.targetId]);
      } else if (mainTabId === undefined) {
        await cdpDebugger.detachDebugger(record.targetId).catch(() => {});
      }
    }
  } else if (kind === 'idleCleanup') {
    if (record.targetType === 'group') {
      if (!hasActiveToolsInGroup(record.targetId)) {
        await cleanupIdleGroupIndicators(record.targetId);
      }
    } else if (!activeToolContexts.has(record.targetId)) {
      await tabGroupManager.hideAgentIndicatorsForTab(record.targetId).catch(() => {});
    }
  } else if (record.targetType === 'group') {
    if (!hasActiveToolsInGroup(record.targetId)) {
      await detachIdleDebuggers(record.targetId, record.memberSnapshot ?? []);
    }
  } else if (!activeToolContexts.has(record.targetId)) {
    await cdpDebugger.detachDebugger(record.targetId).catch(() => {});
  }

  if (sameDeadline(deadlineStore.get(kind, key), record)) {
    removeStoredDeadline(kind, record);
  }
  if (record.targetType === 'group') cleanupEmptyGroupState(record.targetId);
}

function armDeadlineTimeout(
  kind: ToolContextDeadlineKind,
  record: PersistedToolContextDeadline
): void {
  if (kind === 'activeContextExpiry' && record.targetType !== 'tab') return;
  clearDeadlineTimer(kind, record);
  const run = (): void => {
    void processToolContextDeadline(kind, record);
  };
  const delayMs = Math.max(0, record.dueAt - Date.now());
  if (delayMs === 0) {
    run();
    return;
  }
  const timeout = setTimeout(run, delayMs);
  if (record.targetType === 'group') {
    if (kind === 'activeContextExpiry') return;
    const state = ensureGroupFinalizationState(record.targetId);
    if (kind === 'idleCleanup') state.timer = timeout;
    else state.detachTimer = timeout;
    return;
  }
  if (kind === 'idleCleanup') pendingPrefixTimeouts.set(record.targetId, timeout);
  else if (kind === 'debuggerDetach') pendingDebuggerTimeouts.set(record.targetId, timeout);
  else pendingActiveContextExpiryTimeouts.set(record.targetId, timeout);
}

async function restoreToolContextDeadlinesFromStorage(): Promise<void> {
  await deadlineStore.refresh();
  const now = Date.now();
  for (const kind of TOOL_CONTEXT_DEADLINE_KINDS) {
    for (const [key, record] of deadlineStore.entries(kind)) {
      if (record.dueAt <= now) {
        await processToolContextDeadline(kind, record);
        continue;
      }
      if (kind === 'activeContextExpiry' && !activeToolContexts.has(record.targetId)) {
        deadlineStore.remove(kind, key);
        clearDeadlineAlarm(kind, key);
        continue;
      }
      if (record.targetType === 'tab' && !(await tabExists(record.targetId))) {
        deadlineStore.remove(kind, key);
        clearDeadlineAlarm(kind, key);
        continue;
      }
      armDeadlineTimeout(kind, record);
      armDeadlineAlarm(kind, key, record.dueAt);
    }
  }
}

export async function handleToolContextAlarm(alarmName: string): Promise<boolean> {
  const parsed = parseDeadlineAlarmName(alarmName);
  if (!parsed) return false;
  await deadlineStore.refresh();
  const record = deadlineStore.get(parsed.kind, parsed.key);
  if (record) await processToolContextDeadline(parsed.kind, record);
  return true;
}

function scheduleIdleCleanup(mainTabId: number): void {
  const state = groupFinalizationState.get(mainTabId);
  if (!state) return;
  clearGroupTimers(state);
  const memberSnapshot = tabGroupManager.getGroupMemberIds(mainTabId);
  const now = Date.now();
  const idleCleanupDeadline: PersistedToolContextDeadline = {
    targetType: 'group',
    targetId: mainTabId,
    dueAt: now + PREFIX_CLEANUP_DELAY,
    memberSnapshot
  };
  const debuggerDetachDeadline: PersistedToolContextDeadline = {
    targetType: 'group',
    targetId: mainTabId,
    dueAt: now + DEBUGGER_IDLE_DETACH_DELAY,
    memberSnapshot
  };
  setStoredDeadline('idleCleanup', idleCleanupDeadline);
  setStoredDeadline('debuggerDetach', debuggerDetachDeadline);
  armDeadlineTimeout('idleCleanup', idleCleanupDeadline);
  armDeadlineTimeout('debuggerDetach', debuggerDetachDeadline);
}

export function migrateGroupFinalizationState(oldMainTabId: number, newMainTabId: number): void {
  if (oldMainTabId === newMainTabId) return;
  const state = groupFinalizationState.get(oldMainTabId);
  if (!state) return;

  const existingState = groupFinalizationState.get(newMainTabId);
  if (existingState) clearGroupTimers(existingState);

  const hadTimers = state.timer !== null || state.detachTimer !== null;
  clearGroupTimers(state);
  clearStoredDeadlinesForTarget('group', oldMainTabId);
  clearStoredDeadlinesForTarget('group', newMainTabId);
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
  clearStoredDeadlinesForTarget('tab', tabId);
  const startTime = Date.now();
  activeToolContexts.set(tabId, {
    toolName,
    requestId,
    startTime,
    errorCallback
  });
  void persistActiveToolContexts();
  await tabGroupManager.addTabToIndicatorGroup({
    tabId,
    isRunning: true,
    isMcp: true
  });

  const mainTabId = findGroupMainTab(tabId);
  const activeContextDeadline: PersistedToolContextDeadline = {
    targetType: 'tab',
    targetId: tabId,
    dueAt: startTime + ACTIVE_TOOL_CONTEXT_TTL_MS,
    memberSnapshot:
      mainTabId !== undefined ? [tabId, ...tabGroupManager.getGroupMemberIds(mainTabId)] : [tabId]
  };
  setStoredDeadline('activeContextExpiry', activeContextDeadline);
  armDeadlineTimeout('activeContextExpiry', activeContextDeadline);

  if (mainTabId !== undefined) {
    clearStoredDeadlinesForTarget('group', mainTabId);
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
  clearStoredDeadlinesForTarget('tab', tabId);

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
  const now = Date.now();
  const idleCleanupDeadline: PersistedToolContextDeadline = {
    targetType: 'tab',
    targetId: tabId,
    dueAt: now + PREFIX_CLEANUP_DELAY
  };
  const debuggerDetachDeadline: PersistedToolContextDeadline = {
    targetType: 'tab',
    targetId: tabId,
    dueAt: now + DEBUGGER_IDLE_DETACH_DELAY
  };
  setStoredDeadline('idleCleanup', idleCleanupDeadline);
  setStoredDeadline('debuggerDetach', debuggerDetachDeadline);
  armDeadlineTimeout('idleCleanup', idleCleanupDeadline);
  armDeadlineTimeout('debuggerDetach', debuggerDetachDeadline);
}

function clearPrefixForTab(tabId: number): void {
  const timeout = pendingPrefixTimeouts.get(tabId);
  if (timeout) clearTimeout(timeout);
  pendingPrefixTimeouts.delete(tabId);
  clearPendingDebuggerTimeout(tabId);
  tabGroupManager.removePrefix(tabId).catch(() => {});
  clearStoredDeadlinesForTarget('tab', tabId);

  const mainTabId = findGroupMainTab(tabId) ?? tabId;
  const state = groupFinalizationState.get(mainTabId);
  if (state) clearGroupTimers(state);
  groupFinalizationState.delete(mainTabId);
  clearStoredDeadlinesForTarget('group', mainTabId);
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
