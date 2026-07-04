import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  findGroupByTab: vi.fn(),
  getGroupMemberIds: vi.fn(),
  clearIndicatorsForGroup: vi.fn(),
  hideAgentIndicatorsForTab: vi.fn(),
  addCompletionPrefix: vi.fn(),
  setGroupColor: vi.fn(),
  initialize: vi.fn(),
  setTabIndicatorState: vi.fn(),
  hasActiveToolContext: vi.fn()
}));

vi.mock('../mcpRuntime', () => ({
  tabGroupManager: {
    findGroupByTab: fixtures.findGroupByTab,
    getGroupMemberIds: fixtures.getGroupMemberIds,
    clearIndicatorsForGroup: fixtures.clearIndicatorsForGroup,
    hideAgentIndicatorsForTab: fixtures.hideAgentIndicatorsForTab,
    addCompletionPrefix: fixtures.addCompletionPrefix,
    setGroupColor: fixtures.setGroupColor,
    initialize: fixtures.initialize,
    setTabIndicatorState: fixtures.setTabIndicatorState
  }
}));

vi.mock('../mcpRuntime/toolExecution/toolContextState', () => ({
  hasActiveToolContext: fixtures.hasActiveToolContext
}));

vi.stubGlobal('chrome', {
  tabGroups: {
    TAB_GROUP_ID_NONE: -1,
    Color: {
      GREEN: 'green'
    }
  },
  tabs: {
    get: vi.fn(),
    query: vi.fn()
  },
  runtime: {
    sendMessage: vi.fn()
  }
});

const { createStaticIndicatorController } = await import('./staticIndicator');

describe('createStaticIndicatorController', () => {
  beforeEach(() => {
    vi.useRealTimers();
    for (const fn of Object.values(fixtures)) fn.mockReset();
    fixtures.initialize.mockResolvedValue(undefined);
    fixtures.findGroupByTab.mockResolvedValue({
      mainTabId: 10
    });
    fixtures.getGroupMemberIds.mockReturnValue([10, 11]);
    fixtures.clearIndicatorsForGroup.mockResolvedValue(undefined);
    fixtures.hideAgentIndicatorsForTab.mockResolvedValue(undefined);
    fixtures.addCompletionPrefix.mockResolvedValue(undefined);
    fixtures.setGroupColor.mockResolvedValue(undefined);
    fixtures.setTabIndicatorState.mockResolvedValue(undefined);
    fixtures.hasActiveToolContext.mockReturnValue(false);
  });

  it('clears the group and marks it complete when a sidepanel turn finishes', async () => {
    const controller = createStaticIndicatorController();
    const sendResponse = vi.fn();

    await controller.handleAgentTurnActive(
      { type: 'AGENT_TURN_ACTIVE', tabId: 11, active: false, completed: true },
      sendResponse
    );

    expect(fixtures.clearIndicatorsForGroup).toHaveBeenCalledWith(10);
    expect(fixtures.addCompletionPrefix).toHaveBeenCalledWith(10);
    expect(fixtures.setGroupColor).toHaveBeenCalledWith(10, 'green');
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it('waits for active tool contexts to clear before completing the sidepanel turn', async () => {
    vi.useFakeTimers();
    fixtures.hasActiveToolContext.mockReturnValueOnce(true).mockReturnValue(false);
    const controller = createStaticIndicatorController();
    const sendResponse = vi.fn();

    const finishPromise = controller.handleAgentTurnActive(
      { type: 'AGENT_TURN_ACTIVE', tabId: 11, active: false, completed: true },
      sendResponse
    );

    expect(fixtures.clearIndicatorsForGroup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    await finishPromise;

    expect(fixtures.clearIndicatorsForGroup).toHaveBeenCalledWith(10);
    expect(fixtures.addCompletionPrefix).toHaveBeenCalledWith(10);
    expect(fixtures.setGroupColor).toHaveBeenCalledWith(10, 'green');
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
    vi.useRealTimers();
  });

  it('does not force-clear a newly active turn while an old completion retry is pending', async () => {
    vi.useFakeTimers();
    try {
      fixtures.hasActiveToolContext.mockReturnValue(true);
      const controller = createStaticIndicatorController();
      const finishResponse = vi.fn();
      const activeResponse = vi.fn();

      const finishPromise = controller.handleAgentTurnActive(
        { type: 'AGENT_TURN_ACTIVE', tabId: 11, active: false, completed: true },
        finishResponse
      );
      await vi.advanceTimersByTimeAsync(100);

      await controller.handleAgentTurnActive(
        { type: 'AGENT_TURN_ACTIVE', tabId: 11, active: true },
        activeResponse
      );
      await vi.advanceTimersByTimeAsync(2_000);
      await finishPromise;

      expect(fixtures.clearIndicatorsForGroup).not.toHaveBeenCalled();
      expect(fixtures.hideAgentIndicatorsForTab).not.toHaveBeenCalled();
      expect(activeResponse).toHaveBeenCalledWith({ success: true });
      expect(finishResponse).toHaveBeenCalledWith({ success: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides indicators on live member tabs even when the SW group metadata is stale', async () => {
    // Sidepanel-driven turns create the group in the sidepanel's
    // tabGroupManager instance; the service worker's copy may know nothing
    // about it (findGroupByTab falls back to a synthetic "unmanaged" group and
    // clearIndicatorsForGroup no-ops). The turn-end clear must still deliver
    // HIDE to every live member tab.
    fixtures.findGroupByTab.mockResolvedValue({
      mainTabId: 20,
      isUnmanaged: true,
      memberTabs: [
        { tabId: 20, url: '', title: '', joinedAt: 0 },
        { tabId: 21, url: '', title: '', joinedAt: 0 }
      ]
    });
    fixtures.getGroupMemberIds.mockReturnValue([]);
    const controller = createStaticIndicatorController();
    const sendResponse = vi.fn();

    await controller.handleAgentTurnActive(
      { type: 'AGENT_TURN_ACTIVE', tabId: 21, active: false, completed: true },
      sendResponse
    );

    expect(fixtures.hideAgentIndicatorsForTab).toHaveBeenCalledWith(20);
    expect(fixtures.hideAgentIndicatorsForTab).toHaveBeenCalledWith(21);
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it('falls back to hiding the execution tab when the group has no live members listed', async () => {
    const controller = createStaticIndicatorController();
    const sendResponse = vi.fn();

    await controller.handleAgentTurnActive(
      { type: 'AGENT_TURN_ACTIVE', tabId: 11, active: false, completed: true },
      sendResponse
    );

    expect(fixtures.hideAgentIndicatorsForTab).toHaveBeenCalledWith(11);
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it('does not mark cancellation-style turn cleanup as complete', async () => {
    const controller = createStaticIndicatorController();
    const sendResponse = vi.fn();

    await controller.handleAgentTurnActive(
      { type: 'AGENT_TURN_ACTIVE', tabId: 11, active: false },
      sendResponse
    );

    expect(fixtures.clearIndicatorsForGroup).toHaveBeenCalledWith(10);
    expect(fixtures.addCompletionPrefix).not.toHaveBeenCalled();
    expect(fixtures.setGroupColor).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });
});
