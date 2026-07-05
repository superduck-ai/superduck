import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  findGroupByTab: vi.fn(),
  getGroupMemberIds: vi.fn(),
  clearIndicatorsForGroup: vi.fn(),
  hideAgentIndicatorsForTab: vi.fn(),
  dismissStaticIndicatorsForGroup: vi.fn(),
  addCompletionPrefix: vi.fn(),
  setGroupColor: vi.fn(),
  initialize: vi.fn(),
  setTabIndicatorState: vi.fn(),
  hasActiveToolContext: vi.fn(),
  getStorageValue: vi.fn(),
  setStorageValue: vi.fn()
}));

vi.mock('../extensionServices', () => ({
  StorageKeys: {
    TURN_ACTIVE_DEADLINES: 'turnActiveDeadlines'
  },
  getStorageValue: fixtures.getStorageValue,
  setStorageValue: fixtures.setStorageValue
}));

vi.mock('../mcpRuntime', () => ({
  tabGroupManager: {
    findGroupByTab: fixtures.findGroupByTab,
    getGroupMemberIds: fixtures.getGroupMemberIds,
    clearIndicatorsForGroup: fixtures.clearIndicatorsForGroup,
    hideAgentIndicatorsForTab: fixtures.hideAgentIndicatorsForTab,
    dismissStaticIndicatorsForGroup: fixtures.dismissStaticIndicatorsForGroup,
    addCompletionPrefix: fixtures.addCompletionPrefix,
    setGroupColor: fixtures.setGroupColor,
    initialize: fixtures.initialize,
    setTabIndicatorState: fixtures.setTabIndicatorState
  }
}));

vi.mock('../mcpRuntime/toolExecution/toolContextState', () => ({
  hasActiveToolContext: fixtures.hasActiveToolContext
}));

const chromeMock = {
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
  alarms: {
    create: vi.fn(),
    clear: vi.fn()
  },
  runtime: {
    sendMessage: vi.fn()
  }
};

vi.stubGlobal('chrome', chromeMock);

const { createStaticIndicatorController } = await import('./staticIndicator');

async function flushPromises(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

describe('createStaticIndicatorController', () => {
  beforeEach(() => {
    vi.useRealTimers();
    for (const fn of Object.values(fixtures)) fn.mockReset();
    fixtures.initialize.mockResolvedValue(undefined);
    fixtures.getStorageValue.mockResolvedValue({});
    fixtures.setStorageValue.mockResolvedValue(undefined);
    fixtures.findGroupByTab.mockResolvedValue({
      mainTabId: 10
    });
    fixtures.getGroupMemberIds.mockReturnValue([10, 11]);
    fixtures.clearIndicatorsForGroup.mockResolvedValue(undefined);
    fixtures.hideAgentIndicatorsForTab.mockResolvedValue(undefined);
    fixtures.dismissStaticIndicatorsForGroup.mockResolvedValue(undefined);
    fixtures.addCompletionPrefix.mockResolvedValue(undefined);
    fixtures.setGroupColor.mockResolvedValue(undefined);
    fixtures.setTabIndicatorState.mockResolvedValue(undefined);
    fixtures.hasActiveToolContext.mockReturnValue(false);
    chromeMock.tabs.get.mockReset();
    chromeMock.tabs.query.mockReset();
    chromeMock.alarms.create.mockReset();
    chromeMock.alarms.clear.mockReset();
    chromeMock.tabs.get.mockResolvedValue({ id: 11 });
  });

  it('accepts static indicator heartbeat only for managed groups', async () => {
    fixtures.findGroupByTab.mockResolvedValue({
      mainTabId: 10,
      chromeGroupId: 50,
      isUnmanaged: false
    });
    chromeMock.tabs.get.mockResolvedValue({ id: 11, groupId: 50 });
    const controller = createStaticIndicatorController();
    const sendResponse = vi.fn();

    await controller.handleHeartbeat(
      { tab: { id: 11 } } as chrome.runtime.MessageSender,
      sendResponse
    );

    expect(sendResponse).toHaveBeenCalledWith({ success: true });
    expect(chromeMock.tabs.query).not.toHaveBeenCalled();
    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects static indicator heartbeat from unmanaged Chrome groups', async () => {
    fixtures.findGroupByTab.mockResolvedValue({
      mainTabId: 20,
      chromeGroupId: 50,
      isUnmanaged: true,
      memberTabs: [
        { tabId: 20, url: '', title: '', joinedAt: 0 },
        { tabId: 21, url: '', title: '', joinedAt: 0 }
      ]
    });
    chromeMock.tabs.get.mockResolvedValue({ id: 21, groupId: 50 });
    const controller = createStaticIndicatorController();
    const sendResponse = vi.fn();

    await controller.handleHeartbeat(
      { tab: { id: 21 } } as chrome.runtime.MessageSender,
      sendResponse
    );

    expect(sendResponse).toHaveBeenCalledWith({ success: false });
    expect(chromeMock.tabs.query).not.toHaveBeenCalled();
    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('dismisses static indicators only for managed groups', async () => {
    fixtures.findGroupByTab.mockResolvedValue({
      mainTabId: 10,
      chromeGroupId: 50,
      isUnmanaged: false
    });
    const controller = createStaticIndicatorController();
    const sendResponse = vi.fn();

    await controller.dismissForSenderGroup(
      { tab: { id: 11 } } as chrome.runtime.MessageSender,
      sendResponse
    );

    expect(fixtures.dismissStaticIndicatorsForGroup).toHaveBeenCalledWith(50);
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it('does not dismiss static indicators for unmanaged Chrome groups', async () => {
    fixtures.findGroupByTab.mockResolvedValue({
      mainTabId: 20,
      chromeGroupId: 50,
      isUnmanaged: true
    });
    const controller = createStaticIndicatorController();
    const sendResponse = vi.fn();

    await controller.dismissForSenderGroup(
      { tab: { id: 21 } } as chrome.runtime.MessageSender,
      sendResponse
    );

    expect(fixtures.dismissStaticIndicatorsForGroup).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ success: false });
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

  it('does not apply group-level turn cleanup to unmanaged Chrome groups', async () => {
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

    expect(fixtures.clearIndicatorsForGroup).not.toHaveBeenCalled();
    expect(fixtures.addCompletionPrefix).not.toHaveBeenCalled();
    expect(fixtures.setGroupColor).not.toHaveBeenCalled();
    expect(fixtures.hideAgentIndicatorsForTab).not.toHaveBeenCalledWith(20);
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

  it('clears cancellation-style turn cleanup even while a tool context is active', async () => {
    fixtures.hasActiveToolContext.mockReturnValue(true);
    const controller = createStaticIndicatorController();
    const sendResponse = vi.fn();

    await controller.handleAgentTurnActive(
      { type: 'AGENT_TURN_ACTIVE', tabId: 11, active: false },
      sendResponse
    );

    expect(fixtures.clearIndicatorsForGroup).toHaveBeenCalledWith(10);
    expect(fixtures.hideAgentIndicatorsForTab).toHaveBeenCalledWith(11);
    expect(fixtures.addCompletionPrefix).not.toHaveBeenCalled();
    expect(fixtures.setGroupColor).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it('preserves other persisted turn deadlines when cold-start cleanup clears one tab', async () => {
    fixtures.getStorageValue.mockResolvedValue({
      '11': {
        tabId: 11,
        turnKey: '11-old',
        dueAt: 121_000
      },
      '22': {
        tabId: 22,
        turnKey: '22-old',
        dueAt: 122_000
      }
    });
    const controller = createStaticIndicatorController();
    const sendResponse = vi.fn();

    await controller.handleAgentTurnActive(
      { type: 'AGENT_TURN_ACTIVE', tabId: 11, active: false },
      sendResponse
    );

    expect(fixtures.setStorageValue).toHaveBeenCalledWith('turnActiveDeadlines', {
      '22': {
        tabId: 22,
        turnKey: '22-old',
        dueAt: 122_000
      }
    });
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it('persists active turn cleanup as an absolute deadline and alarm', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      const controller = createStaticIndicatorController();
      const sendResponse = vi.fn();

      await controller.handleAgentTurnActive(
        { type: 'AGENT_TURN_ACTIVE', tabId: 11, active: true },
        sendResponse
      );

      await flushPromises();
      expect(fixtures.setTabIndicatorState).toHaveBeenCalledWith(11, 'pulsing', true, false);
      expect(fixtures.setStorageValue).toHaveBeenLastCalledWith('turnActiveDeadlines', {
        '11': {
          tabId: 11,
          turnKey: '11-1000',
          dueAt: 121_000
        }
      });
      expect(chromeMock.alarms.create).toHaveBeenCalledWith('superduck.turnActive.11', {
        when: 121_000
      });
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not start active turn tracking for unmanaged Chrome groups', async () => {
    fixtures.findGroupByTab.mockResolvedValue({
      mainTabId: 20,
      chromeGroupId: 50,
      isUnmanaged: true
    });
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      const controller = createStaticIndicatorController();
      const sendResponse = vi.fn();

      await controller.handleAgentTurnActive(
        { type: 'AGENT_TURN_ACTIVE', tabId: 11, active: true },
        sendResponse
      );

      expect(fixtures.setTabIndicatorState).not.toHaveBeenCalled();
      expect(chromeMock.alarms.create).not.toHaveBeenCalled();
      expect(fixtures.setStorageValue).not.toHaveBeenCalledWith('turnActiveDeadlines', {
        '11': expect.anything()
      });
      expect(sendResponse).toHaveBeenCalledWith({ success: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores and executes overdue active turn cleanup after a service-worker wake', async () => {
    fixtures.getStorageValue.mockResolvedValue({
      '11': {
        tabId: 11,
        turnKey: '11-old',
        dueAt: Date.now() - 1
      }
    });
    const controller = createStaticIndicatorController();

    await controller.restoreTurnActiveDeadlines();

    expect(fixtures.clearIndicatorsForGroup).toHaveBeenCalledWith(10);
    expect(fixtures.hideAgentIndicatorsForTab).toHaveBeenCalledWith(11);
    expect(chromeMock.alarms.clear).toHaveBeenCalledWith('superduck.turnActive.11');
    expect(fixtures.setStorageValue).toHaveBeenCalledWith('turnActiveDeadlines', {});
  });

  it('does not resurrect a deleted active turn deadline from stale storage', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      fixtures.setStorageValue.mockReturnValue(new Promise<void>(() => {}));
      fixtures.getStorageValue.mockResolvedValue({
        '11': {
          tabId: 11,
          turnKey: '11-1000',
          dueAt: 121_000
        }
      });
      const controller = createStaticIndicatorController();

      await controller.handleAgentTurnActive(
        { type: 'AGENT_TURN_ACTIVE', tabId: 11, active: true },
        vi.fn()
      );
      await controller.handleAgentTurnActive(
        { type: 'AGENT_TURN_ACTIVE', tabId: 11, active: false },
        vi.fn()
      );

      fixtures.clearIndicatorsForGroup.mockClear();
      fixtures.hideAgentIndicatorsForTab.mockClear();
      await controller.handleAlarm('superduck.turnActive.11');

      expect(fixtures.clearIndicatorsForGroup).not.toHaveBeenCalled();
      expect(fixtures.hideAgentIndicatorsForTab).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not let a slow restore overwrite a newly active turn deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      let resolveStoredDeadlines!: (value: unknown) => void;
      fixtures.getStorageValue.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveStoredDeadlines = resolve;
        })
      );
      const controller = createStaticIndicatorController();

      const restorePromise = controller.restoreTurnActiveDeadlines();
      await Promise.resolve();

      const sendResponse = vi.fn();
      await controller.handleAgentTurnActive(
        { type: 'AGENT_TURN_ACTIVE', tabId: 11, active: true },
        sendResponse
      );
      resolveStoredDeadlines({
        '11': {
          tabId: 11,
          turnKey: '11-old',
          dueAt: 10_000
        }
      });
      await restorePromise;

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
      expect(fixtures.clearIndicatorsForGroup).not.toHaveBeenCalled();
      expect(fixtures.setStorageValue).toHaveBeenCalledWith('turnActiveDeadlines', {
        '11': {
          tabId: 11,
          turnKey: '11-1000',
          dueAt: 121_000
        }
      });
      expect(chromeMock.alarms.create).toHaveBeenLastCalledWith('superduck.turnActive.11', {
        when: 121_000
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
