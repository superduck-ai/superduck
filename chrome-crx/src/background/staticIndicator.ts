import { tabGroupManager } from '../mcpRuntime';

type SuccessResponse = { success: boolean };

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

  /**
   * Heartbeat from the agent overlay (mask + cursor). The content script polls
   * to self-correct a dropped HIDE: we answer success only while the tab's
   * indicatorState is still "pulsing" (the authoritative backend truth). Once
   * the turn ends / finalize flips the state to "none", the content script
   * self-hides even if the HIDE message was lost.
   */
  async function handleAgentIndicatorHeartbeat(
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
      sendResponse({ success: tabGroupManager.getTabIndicatorState(senderTabId) === 'pulsing' });
    } catch {
      sendResponse({ success: false });
    }
  }

  return {
    handleHeartbeat,
    dismissForSenderGroup,
    handleAgentIndicatorHeartbeat
  };
}
