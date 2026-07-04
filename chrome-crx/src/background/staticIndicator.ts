import { StorageKeys } from '../extensionServices';
import { tabGroupManager } from '../mcpRuntime';
import { hasActiveToolContext } from '../mcpRuntime/toolExecution/toolContextState';
import { PersistentDeadlineStore, type DeadlineState } from '../utils/persistentDeadlineStore';

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
const TURN_ACTIVE_DEADLINE_KINDS = ['turnActive'] as const;
type TurnActiveDeadlineKind = (typeof TURN_ACTIVE_DEADLINE_KINDS)[number];

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

function loadTurnActiveDeadlineState(
  stored: unknown
): DeadlineState<TurnActiveDeadlineKind, TurnActiveDeadline> {
  const next: DeadlineState<TurnActiveDeadlineKind, TurnActiveDeadline> = {
    turnActive: {}
  };
  if (!isRecord(stored)) return next;
  for (const [key, value] of Object.entries(stored)) {
    if (!isTurnActiveDeadline(value) || String(value.tabId) !== key) continue;
    next.turnActive[key] = { ...value };
  }
  return next;
}

function serializeTurnActiveDeadlineState(
  state: DeadlineState<TurnActiveDeadlineKind, TurnActiveDeadline>
): TurnActiveDeadlineStorage {
  return { ...state.turnActive };
}

export function createStaticIndicatorController() {
  async function findManagedGroupByTab(tabId: number) {
    const group = await tabGroupManager.findGroupByTab(tabId);
    return group && !group.isUnmanaged ? group : null;
  }

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

      const group = await findManagedGroupByTab(senderTabId);
      sendResponse({ success: Boolean(group) });
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
      await tabGroupManager.initialize();
      const group = await findManagedGroupByTab(senderTabId);
      if (!group) {
        sendResponse({ success: false });
        return;
      }

      await tabGroupManager.dismissStaticIndicatorsForGroup(group.chromeGroupId);
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
  const turnActiveDeadlineStore = new PersistentDeadlineStore<
    TurnActiveDeadlineKind,
    TurnActiveDeadline
  >({
    storageKey: StorageKeys.TURN_ACTIVE_DEADLINES,
    kinds: TURN_ACTIVE_DEADLINE_KINDS,
    emptyState: { turnActive: {} },
    loadState: loadTurnActiveDeadlineState,
    serializeState: serializeTurnActiveDeadlineState,
    warnLabel: 'turn active deadlines'
  });

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function clearTurnIndicators(
    tabId: number,
    options: { turnKey?: string; completed?: boolean; force?: boolean } = {}
  ): Promise<boolean> {
    const activeTimer = turnActiveTimers.get(tabId);
    if (options.turnKey && activeTimer && activeTimer.turnKey !== options.turnKey) return true;

    const group = await findManagedGroupByTab(tabId);
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

  async function clearTurnActiveDeadline(tabId: number): Promise<void> {
    await turnActiveDeadlineStore.refresh();
    const prev = turnActiveTimers.get(tabId);
    if (prev) clearTimeout(prev.timer);
    turnActiveTimers.delete(tabId);
    const key = String(tabId);
    turnActiveDeadlineStore.remove('turnActive', key);
    clearTurnActiveAlarm(tabId);
  }

  async function processTurnActiveDeadline(deadline: TurnActiveDeadline): Promise<void> {
    const key = String(deadline.tabId);
    const current = turnActiveDeadlineStore.get('turnActive', key);
    if (!current || current.turnKey !== deadline.turnKey || current.dueAt !== deadline.dueAt) {
      return;
    }
    const prev = turnActiveTimers.get(deadline.tabId);
    if (prev) clearTimeout(prev.timer);
    turnActiveTimers.delete(deadline.tabId);
    turnActiveDeadlineStore.remove('turnActive', key);
    clearTurnActiveAlarm(deadline.tabId);
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
    await turnActiveDeadlineStore.refresh();
    const now = Date.now();
    for (const [key, deadline] of turnActiveDeadlineStore.entries('turnActive')) {
      if (deadline.dueAt <= now) {
        await processTurnActiveDeadline(deadline);
        continue;
      }
      try {
        await chrome.tabs.get(deadline.tabId);
      } catch {
        turnActiveDeadlineStore.remove('turnActive', key);
        clearTurnActiveAlarm(deadline.tabId);
        continue;
      }
      armTurnActiveDeadline(deadline);
    }
  }

  async function handleAlarm(alarmName: string): Promise<boolean> {
    const tabId = parseTurnActiveAlarmName(alarmName);
    if (typeof tabId !== 'number') return false;
    await turnActiveDeadlineStore.refresh();
    const deadline = turnActiveDeadlineStore.get('turnActive', String(tabId));
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
    turnActiveDeadlineStore.set('turnActive', String(tabId), deadline);
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
      await clearTurnActiveDeadline(tabId);
      if (active) {
        const group = await findManagedGroupByTab(tabId);
        if (!group) {
          sendResponse({ success: false });
          return;
        }
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
