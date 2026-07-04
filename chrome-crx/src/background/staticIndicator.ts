import { StorageKeys, getStorageValue, setStorageValue } from '../extensionServices';
import { tabGroupManager } from '../mcpRuntime';
import { hasActiveToolContext } from '../mcpRuntime/toolExecution/toolContextState';
import { PendingDeleteSet } from '../utils/pendingDeleteSet';

type SuccessResponse = { success: boolean };
type AgentTurnActiveMessage = {
  type?: string;
  tabId?: unknown;
  active?: unknown;
  completed?: unknown;
};

type TurnActiveDeadline = {
  tabId: number;
  turnKey: string;
  dueAt: number;
};

type TurnActiveDeadlineStorage = Record<string, TurnActiveDeadline>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTurnActiveDeadline(value: unknown): value is TurnActiveDeadline {
  if (!isRecord(value)) return false;
  return (
    typeof value.tabId === 'number' &&
    Number.isInteger(value.tabId) &&
    typeof value.turnKey === 'string' &&
    typeof value.dueAt === 'number' &&
    Number.isFinite(value.dueAt)
  );
}

export function createStaticIndicatorController() {
  const mainTabAckCache = new Map<number, { timestamp: number; isAlive: boolean }>();

  async function handleHeartbeat(
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: SuccessResponse) => void
  ) {
    const senderTabId = sender.tab?.id;
    if (!senderTabId) {
      sendResponse({ success: false });
      return;
    }

    try {
      const senderTab = await chrome.tabs.get(senderTabId);
      const groupId = senderTab.groupId;

      if (groupId === undefined || groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
        sendResponse({ success: false });
        return;
      }

      if (await tabGroupManager.findGroupByTab(senderTabId)) {
        sendResponse({ success: true });
        return;
      }

      const groupTabs = await chrome.tabs.query({ groupId });

      const checkTab = async (index: number): Promise<void> => {
        if (index >= groupTabs.length) {
          sendResponse({ success: false });
          return;
        }

        const candidateTab = groupTabs[index];
        if (candidateTab.id === senderTabId || !candidateTab.id) {
          await checkTab(index + 1);
          return;
        }

        const candidateTabId = candidateTab.id;
        const now = Date.now();
        const cached = mainTabAckCache.get(candidateTabId);

        if (cached && now - cached.timestamp < 3_000) {
          if (cached.isAlive) {
            sendResponse({ success: true });
          } else {
            await checkTab(index + 1);
          }
          return;
        }

        chrome.runtime.sendMessage(
          {
            type: 'MAIN_TAB_ACK_REQUEST',
            secondaryTabId: senderTabId,
            mainTabId: candidateTabId,
            timestamp: now
          },
          async (response) => {
            const isAlive = response?.success ?? false;
            mainTabAckCache.set(candidateTabId, { timestamp: now, isAlive });
            if (isAlive) {
              sendResponse({ success: true });
            } else {
              await checkTab(index + 1);
            }
          }
        );
      };

      await checkTab(0);
    } catch {
      sendResponse({ success: false });
    }
  }

  async function dismissForSenderGroup(
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: SuccessResponse) => void
  ) {
    const senderTabId = sender.tab?.id;
    if (!senderTabId) {
      sendResponse({ success: false });
      return;
    }

    try {
      const senderTab = await chrome.tabs.get(senderTabId);
      const groupId = senderTab.groupId;

      if (groupId === undefined || groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
        sendResponse({ success: false });
        return;
      }

      await tabGroupManager.initialize();
      await tabGroupManager.dismissStaticIndicatorsForGroup(groupId);
      sendResponse({ success: true });
    } catch {
      sendResponse({ success: false });
    }
  }

  const turnActiveTimers = new Map<
    number,
    { timer: ReturnType<typeof setTimeout>; turnKey: string; dueAt: number }
  >();
  const TURN_ACTIVE_TIMEOUT_MS = 2 * 60 * 1000;
  const TURN_CLEAR_RETRY_MS = 100;
  const TURN_CLEAR_RETRY_ATTEMPTS = 20;
  const TURN_ACTIVE_ALARM_PREFIX = 'superduck.turnActive.';
  let persistedTurnActiveDeadlines: TurnActiveDeadlineStorage = {};
  let turnActiveDeadlineRevision = 0;
  const pendingDeletedTurnActiveDeadlines = new PendingDeleteSet();

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function clearTurnIndicators(
    tabId: number,
    options: { turnKey?: string; completed?: boolean; force?: boolean } = {}
  ): Promise<boolean> {
    const activeTimer = turnActiveTimers.get(tabId);
    if (options.turnKey && activeTimer && activeTimer.turnKey !== options.turnKey) return true;

    const group = await tabGroupManager.findGroupByTab(tabId);
    if (group) {
      // Sidepanel-driven turns run their tools in the sidepanel context, so
      // this (service worker) instance's group metadata can be stale or empty
      // for the group — clearIndicatorsForGroup would then silently send
      // nothing. Hide directly on the live member tabs as well; that path
      // does not depend on in-memory member states.
      const liveMemberIds = (group.memberTabs ?? []).map((member) => member.tabId);
      const hideTargets = liveMemberIds.length > 0 ? liveMemberIds : [tabId];
      const gateIds = new Set([
        ...tabGroupManager.getGroupMemberIds(group.mainTabId),
        ...hideTargets
      ]);
      if (!options.force && [...gateIds].some((id) => hasActiveToolContext(id))) return false;
      await tabGroupManager.clearIndicatorsForGroup(group.mainTabId);
      for (const memberTabId of hideTargets) {
        await tabGroupManager.hideAgentIndicatorsForTab(memberTabId);
      }
      if (options.completed) {
        await tabGroupManager.addCompletionPrefix(group.mainTabId);
        await tabGroupManager.setGroupColor(group.mainTabId, chrome.tabGroups.Color.GREEN);
      }
    } else {
      await tabGroupManager.hideAgentIndicatorsForTab(tabId);
    }
    return true;
  }

  function turnActiveAlarmName(tabId: number): string {
    return `${TURN_ACTIVE_ALARM_PREFIX}${tabId}`;
  }

  function parseTurnActiveAlarmName(alarmName: string): number | undefined {
    if (!alarmName.startsWith(TURN_ACTIVE_ALARM_PREFIX)) return undefined;
    const tabId = Number(alarmName.slice(TURN_ACTIVE_ALARM_PREFIX.length));
    return Number.isInteger(tabId) ? tabId : undefined;
  }

  async function loadTurnActiveDeadlines(): Promise<TurnActiveDeadlineStorage> {
    try {
      const stored = await getStorageValue<unknown>(StorageKeys.TURN_ACTIVE_DEADLINES);
      const next: TurnActiveDeadlineStorage = {};
      if (!isRecord(stored)) return next;
      for (const [key, value] of Object.entries(stored)) {
        if (!isTurnActiveDeadline(value) || String(value.tabId) !== key) continue;
        next[key] = { ...value };
      }
      return next;
    } catch {
      return {};
    }
  }

  function mergeTurnActiveDeadlinesFromStorage(
    loaded: TurnActiveDeadlineStorage
  ): TurnActiveDeadlineStorage {
    return { ...loaded, ...persistedTurnActiveDeadlines };
  }

  function applyPendingTurnActiveDeletes(
    state: TurnActiveDeadlineStorage
  ): TurnActiveDeadlineStorage {
    return pendingDeletedTurnActiveDeadlines.applyTo(state);
  }

  function clearPersistedTurnActiveDeletes(snapshot: Map<string, number>): void {
    pendingDeletedTurnActiveDeadlines.clearPersisted(snapshot, persistedTurnActiveDeadlines);
  }

  function markTurnActiveDeadlineDeleted(key: string): void {
    pendingDeletedTurnActiveDeadlines.mark(key, turnActiveDeadlineRevision);
  }

  async function refreshTurnActiveDeadlinesFromStorage(): Promise<void> {
    const revisionBeforeLoad = turnActiveDeadlineRevision;
    const loaded = await loadTurnActiveDeadlines();
    const next =
      turnActiveDeadlineRevision === revisionBeforeLoad
        ? loaded
        : mergeTurnActiveDeadlinesFromStorage(loaded);
    persistedTurnActiveDeadlines = applyPendingTurnActiveDeletes(next);
  }

  async function persistTurnActiveDeadlines(): Promise<void> {
    const deadlinesToPersist = { ...persistedTurnActiveDeadlines };
    const deleteSnapshot = pendingDeletedTurnActiveDeadlines.snapshot();
    try {
      await setStorageValue(StorageKeys.TURN_ACTIVE_DEADLINES, deadlinesToPersist);
      clearPersistedTurnActiveDeletes(deleteSnapshot);
    } catch {
      // best-effort recovery state only
    }
  }

  function armTurnActiveAlarm(tabId: number, dueAt: number): void {
    try {
      chrome.alarms?.create?.(turnActiveAlarmName(tabId), {
        when: Math.max(Date.now() + 1, dueAt)
      });
    } catch {
      // setTimeout remains the in-lifetime fallback
    }
  }

  function clearTurnActiveAlarm(tabId: number): void {
    try {
      chrome.alarms?.clear?.(turnActiveAlarmName(tabId));
    } catch {
      // alarms are unavailable in some unit-test shims
    }
  }

  function clearTurnActiveDeadline(tabId: number): void {
    const prev = turnActiveTimers.get(tabId);
    if (prev) clearTimeout(prev.timer);
    turnActiveTimers.delete(tabId);
    turnActiveDeadlineRevision++;
    const key = String(tabId);
    delete persistedTurnActiveDeadlines[key];
    markTurnActiveDeadlineDeleted(key);
    clearTurnActiveAlarm(tabId);
    void persistTurnActiveDeadlines();
  }

  async function processTurnActiveDeadline(deadline: TurnActiveDeadline): Promise<void> {
    const key = String(deadline.tabId);
    const current = persistedTurnActiveDeadlines[key];
    if (!current || current.turnKey !== deadline.turnKey || current.dueAt !== deadline.dueAt) {
      return;
    }
    const prev = turnActiveTimers.get(deadline.tabId);
    if (prev) clearTimeout(prev.timer);
    turnActiveTimers.delete(deadline.tabId);
    turnActiveDeadlineRevision++;
    delete persistedTurnActiveDeadlines[key];
    markTurnActiveDeadlineDeleted(key);
    clearTurnActiveAlarm(deadline.tabId);
    void persistTurnActiveDeadlines();
    await clearTurnIndicators(deadline.tabId, { turnKey: deadline.turnKey });
  }

  function armTurnActiveDeadline(deadline: TurnActiveDeadline): void {
    const prev = turnActiveTimers.get(deadline.tabId);
    if (prev) clearTimeout(prev.timer);
    const delayMs = Math.max(0, deadline.dueAt - Date.now());
    const timer = setTimeout(() => {
      void processTurnActiveDeadline(deadline);
    }, delayMs);
    turnActiveTimers.set(deadline.tabId, {
      timer,
      turnKey: deadline.turnKey,
      dueAt: deadline.dueAt
    });
    armTurnActiveAlarm(deadline.tabId, deadline.dueAt);
  }

  async function restoreTurnActiveDeadlines(): Promise<void> {
    await refreshTurnActiveDeadlinesFromStorage();
    const now = Date.now();
    let changed = false;
    for (const [key, deadline] of Object.entries(persistedTurnActiveDeadlines)) {
      if (deadline.dueAt <= now) {
        await processTurnActiveDeadline(deadline);
        continue;
      }
      try {
        await chrome.tabs.get(deadline.tabId);
      } catch {
        turnActiveDeadlineRevision++;
        delete persistedTurnActiveDeadlines[key];
        markTurnActiveDeadlineDeleted(key);
        clearTurnActiveAlarm(deadline.tabId);
        changed = true;
        continue;
      }
      armTurnActiveDeadline(deadline);
    }
    if (changed) void persistTurnActiveDeadlines();
  }

  async function handleAlarm(alarmName: string): Promise<boolean> {
    const tabId = parseTurnActiveAlarmName(alarmName);
    if (typeof tabId !== 'number') return false;
    await refreshTurnActiveDeadlinesFromStorage();
    const deadline = persistedTurnActiveDeadlines[String(tabId)];
    if (deadline) await processTurnActiveDeadline(deadline);
    return true;
  }

  async function clearTurnIndicatorsWithRetry(
    tabId: number,
    options: { completed?: boolean } = {}
  ): Promise<boolean> {
    const attempts = options.completed ? TURN_CLEAR_RETRY_ATTEMPTS : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const force = options.completed && attempt === attempts - 1;
      if (force && turnActiveTimers.has(tabId)) return true;
      const cleared = await clearTurnIndicators(tabId, {
        completed: options.completed,
        force
      });
      if (cleared) return true;
      await delay(TURN_CLEAR_RETRY_MS);
    }
    return false;
  }

  function armTurnActiveTimeout(tabId: number): void {
    const turnKey = `${tabId}-${Date.now()}`;
    const deadline: TurnActiveDeadline = {
      tabId,
      turnKey,
      dueAt: Date.now() + TURN_ACTIVE_TIMEOUT_MS
    };
    turnActiveDeadlineRevision++;
    persistedTurnActiveDeadlines[String(tabId)] = deadline;
    pendingDeletedTurnActiveDeadlines.clear(String(tabId));
    void persistTurnActiveDeadlines();
    armTurnActiveDeadline(deadline);
  }

  async function handleAgentTurnActive(
    message: AgentTurnActiveMessage,
    sendResponse: (response: SuccessResponse) => void
  ) {
    const tabId = typeof message.tabId === 'number' ? message.tabId : undefined;
    const active = message.active === true;
    const completed = message.completed === true;
    if (typeof tabId !== 'number') {
      sendResponse({ success: false });
      return;
    }
    try {
      await tabGroupManager.initialize();
      clearTurnActiveDeadline(tabId);
      if (active) {
        if (hasActiveToolContext(tabId)) {
          armTurnActiveTimeout(tabId);
          sendResponse({ success: true });
          return;
        }
        await tabGroupManager.setTabIndicatorState(tabId, 'pulsing', true, false);
        armTurnActiveTimeout(tabId);
      } else {
        const cleared = await clearTurnIndicatorsWithRetry(tabId, { completed });
        sendResponse({ success: cleared });
        return;
      }
      sendResponse({ success: true });
    } catch {
      sendResponse({ success: false });
    }
  }

  return {
    handleHeartbeat,
    dismissForSenderGroup,
    handleAgentTurnActive,
    handleAlarm,
    restoreTurnActiveDeadlines
  };
}
