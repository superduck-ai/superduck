import { tabGroupManager } from '../mcpRuntime';
import { hasActiveToolContext } from '../mcpRuntime/toolExecution/toolContextState';

type SuccessResponse = { success: boolean };
type AgentTurnActiveMessage = {
  type?: string;
  tabId?: unknown;
  active?: unknown;
  completed?: unknown;
};

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
    { timer: ReturnType<typeof setTimeout>; turnKey: string }
  >();
  const TURN_ACTIVE_TIMEOUT_MS = 2 * 60 * 1000;
  const TURN_CLEAR_RETRY_MS = 100;
  const TURN_CLEAR_RETRY_ATTEMPTS = 20;

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
    const timer = setTimeout(() => {
      turnActiveTimers.delete(tabId);
      void clearTurnIndicators(tabId, { turnKey });
    }, TURN_ACTIVE_TIMEOUT_MS);
    turnActiveTimers.set(tabId, { timer, turnKey });
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
      const prev = turnActiveTimers.get(tabId);
      if (prev) {
        clearTimeout(prev.timer);
        turnActiveTimers.delete(tabId);
      }
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
    handleAgentTurnActive
  };
}
