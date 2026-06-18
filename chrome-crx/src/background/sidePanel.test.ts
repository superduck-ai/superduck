import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mcpRuntimeMocks = vi.hoisted(() => ({
  migrateGroupFinalizationState: vi.fn(),
  tabGroupManager: {
    initialize: vi.fn(),
    findGroupByTab: vi.fn(),
    adoptOrphanedGroup: vi.fn(),
    promoteToMainTab: vi.fn(),
    createGroup: vi.fn()
  }
}));

vi.mock('../mcpRuntime', () => mcpRuntimeMocks);

import { createSidePanelController } from './sidePanel';

describe('createSidePanelController', () => {
  const sendMessage = vi.fn();
  const setOptions = vi.fn();
  const closePanel = vi.fn();
  const openPanel = vi.fn();
  const tabsGet = vi.fn();
  const tabsQuery = vi.fn();
  const sessionGet = vi.fn();
  const sessionSet = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    tabsGet.mockResolvedValue({ id: 42, windowId: 7, groupId: -1 });
    tabsQuery.mockResolvedValue([]);
    setOptions.mockResolvedValue(undefined);
    sessionGet.mockResolvedValue({});
    sessionSet.mockResolvedValue(undefined);
    closePanel.mockResolvedValue(undefined);
    openPanel.mockResolvedValue(undefined);
    mcpRuntimeMocks.tabGroupManager.initialize.mockResolvedValue(undefined);
    mcpRuntimeMocks.tabGroupManager.findGroupByTab.mockResolvedValue({
      isUnmanaged: false,
      mainTabId: 42,
      chromeGroupId: 1
    });
    mcpRuntimeMocks.tabGroupManager.promoteToMainTab.mockResolvedValue(undefined);
    mcpRuntimeMocks.tabGroupManager.createGroup.mockResolvedValue({
      isUnmanaged: false,
      mainTabId: 42,
      chromeGroupId: 1
    });

    vi.stubGlobal('chrome', {
      runtime: {
        lastError: undefined,
        sendMessage
      },
      sidePanel: {
        close: closePanel,
        open: openPanel,
        setOptions
      },
      storage: {
        session: {
          get: sessionGet,
          set: sessionSet
        }
      },
      tabs: {
        get: tabsGet,
        query: tabsQuery
      },
      tabGroups: {
        TAB_GROUP_ID_NONE: -1
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function flushAsyncSetup() {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
    }
  }

  it('retries runtime prompt delivery until a panel handles the message', async () => {
    const responses = [{ success: false, skipped: true }, { success: true }];
    sendMessage.mockImplementation(
      (_message: Record<string, unknown>, callback: (response?: unknown) => void) => {
        if (_message.type === 'SIDE_PANEL_SET_ACTIVE_TAB') {
          callback({ success: true });
          return;
        }
        callback(responses.shift());
      }
    );

    const controller = createSidePanelController({
      connectNativeHost: vi.fn(async () => true)
    });
    const request = controller.openSidePanelRequest({ tabId: 42, prompt: 'Open the dashboard' });

    await flushAsyncSetup();
    await vi.advanceTimersByTimeAsync(800);
    expect(
      sendMessage.mock.calls.filter(([message]) => message.type === 'POPULATE_INPUT_TEXT')
    ).toHaveLength(1);

    await flushAsyncSetup();
    await vi.advanceTimersByTimeAsync(500);
    await request;

    const promptMessages = sendMessage.mock.calls.filter(
      ([message]) => message.type === 'POPULATE_INPUT_TEXT'
    );
    expect(promptMessages).toHaveLength(2);
    expect(promptMessages.at(-1)).toEqual([
      {
        type: 'POPULATE_INPUT_TEXT',
        prompt: 'Open the dashboard',
        targetTabId: 42,
        permissionMode: undefined,
        selectedModel: undefined,
        attachments: undefined
      },
      expect.any(Function)
    ]);
  });

  it('promotes the requested tab when opening the sidepanel for a managed secondary tab', async () => {
    mcpRuntimeMocks.tabGroupManager.findGroupByTab.mockResolvedValue({
      isUnmanaged: false,
      mainTabId: 7,
      chromeGroupId: 1
    });

    const controller = createSidePanelController({
      connectNativeHost: vi.fn(async () => true)
    });

    await controller.openSidePanel(42);

    expect(mcpRuntimeMocks.tabGroupManager.promoteToMainTab).toHaveBeenCalledWith(7, 42);
    expect(mcpRuntimeMocks.migrateGroupFinalizationState).toHaveBeenCalledWith(7, 42);
    expect(mcpRuntimeMocks.tabGroupManager.createGroup).not.toHaveBeenCalled();
  });

  it('creates a group when explicitly opening the sidepanel for an ungrouped tab', async () => {
    mcpRuntimeMocks.tabGroupManager.findGroupByTab.mockResolvedValue(null);

    const controller = createSidePanelController({
      connectNativeHost: vi.fn(async () => true)
    });

    await controller.handleActionClick({ id: 42, windowId: 7 } as chrome.tabs.Tab);

    expect(openPanel).toHaveBeenCalledWith({ tabId: 42 });
    expect(setOptions).not.toHaveBeenCalledWith({
      path: 'sidepanel.html',
      enabled: true
    });
    expect(setOptions).toHaveBeenCalledWith({
      tabId: 42,
      path: 'sidepanel.html',
      enabled: true
    });
    expect(mcpRuntimeMocks.tabGroupManager.createGroup).toHaveBeenCalledWith(42);
    expect(sendMessage).toHaveBeenCalledWith(
      {
        type: 'SIDE_PANEL_SET_ACTIVE_TAB',
        tabId: 42,
        windowId: 7
      },
      expect.any(Function)
    );
  });

  it('keeps the sidepanel enabled when activating a managed SuperDuck group tab', async () => {
    const controller = createSidePanelController({
      connectNativeHost: vi.fn(async () => true)
    });

    await controller.handleTabActivated({ tabId: 42, windowId: 7 });

    expect(mcpRuntimeMocks.tabGroupManager.initialize).toHaveBeenCalledWith(true);
    expect(mcpRuntimeMocks.tabGroupManager.findGroupByTab).toHaveBeenCalledWith(42);
    expect(setOptions).toHaveBeenCalledWith({
      tabId: 42,
      path: 'sidepanel.html',
      enabled: true
    });
    expect(closePanel).not.toHaveBeenCalled();
  });

  it('hides the sidepanel without closing the iframe when activating an ungrouped tab', async () => {
    mcpRuntimeMocks.tabGroupManager.findGroupByTab.mockResolvedValue(null);
    const controller = createSidePanelController({
      connectNativeHost: vi.fn(async () => true)
    });

    await controller.handleTabActivated({ tabId: 99, windowId: 8 });

    expect(setOptions).toHaveBeenCalledWith({
      tabId: 99,
      enabled: false
    });
    expect(closePanel).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalledWith({
      type: 'CLOSE_SIDE_PANEL_FOR_WORKSPACE',
      windowId: 8
    });
  });

  it('hides the sidepanel without closing the iframe when activating an unmanaged Chrome tab group', async () => {
    mcpRuntimeMocks.tabGroupManager.findGroupByTab.mockResolvedValue({
      isUnmanaged: true,
      mainTabId: 99,
      chromeGroupId: 5
    });
    tabsGet.mockResolvedValue({ id: 99, windowId: 8, groupId: 5 });
    tabsQuery.mockResolvedValue([{ id: 99 }, { id: 100 }]);
    const controller = createSidePanelController({
      connectNativeHost: vi.fn(async () => true)
    });

    await controller.handleTabActivated({ tabId: 99, windowId: 8 });

    expect(setOptions).toHaveBeenCalledWith({
      tabId: 99,
      enabled: false
    });
    expect(setOptions).toHaveBeenCalledWith({
      tabId: 100,
      enabled: false
    });
    expect(closePanel).not.toHaveBeenCalled();
  });
});
