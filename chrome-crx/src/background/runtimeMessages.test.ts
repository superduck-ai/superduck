import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mcpRuntimeMocks = vi.hoisted(() => ({
  isBridgeConnected: vi.fn(() => false),
  migrateGroupFinalizationState: vi.fn(),
  sendMcpNotificationViaBridge: vi.fn(() => false),
  tabGroupManager: {
    initialize: vi.fn(),
    findGroupByTab: vi.fn(),
    adoptOrphanedGroup: vi.fn(),
    promoteToMainTab: vi.fn(),
    createGroup: vi.fn()
  },
  trackEvent: vi.fn()
}));

const sidePanelMocks = vi.hoisted(() => ({
  incrementPanelAlive: vi.fn(async () => undefined),
  decrementPanelAlive: vi.fn(async () => undefined)
}));

vi.mock('../mcpRuntime', () => mcpRuntimeMocks);
vi.mock('./sidePanel', () => sidePanelMocks);

import { registerRuntimeMessageListener, type RuntimeMessageListenerDeps } from './runtimeMessages';

describe('registerRuntimeMessageListener PANEL_READY', () => {
  const runtimeSendMessage = vi.fn();
  const tabsQuery = vi.fn();
  let messageListener:
    | ((
        message: { type?: string },
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: Record<string, unknown>) => void
      ) => boolean | void)
    | undefined;

  const deps: RuntimeMessageListenerDeps = {
    openSidePanelRequest: vi.fn(),
    openOptionsWithTask: vi.fn(),
    getNativeHostStatus: vi.fn(),
    resetNativeHost: vi.fn(),
    sendMcpNotification: vi.fn(),
    executeScheduledTask: vi.fn(),
    handleStaticIndicatorHeartbeat: vi.fn(),
    handleDismissStaticIndicator: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    messageListener = undefined;
    mcpRuntimeMocks.isBridgeConnected.mockReturnValue(false);
    deps.getNativeHostStatus = vi.fn(async () => ({
      nativeHostInstalled: false,
      mcpConnected: false
    }));
    deps.resetNativeHost = vi.fn(async () => ({
      success: true,
      reconnecting: true,
      status: {
        nativeHostInstalled: true,
        mcpConnected: false
      }
    }));
    tabsQuery.mockResolvedValue([{ id: 99, windowId: 11 }]);
    runtimeSendMessage.mockImplementation(
      (_message: unknown, callback?: (response?: unknown) => void) => {
        callback?.({ success: true });
      }
    );
    mcpRuntimeMocks.tabGroupManager.initialize.mockResolvedValue(undefined);
    mcpRuntimeMocks.tabGroupManager.findGroupByTab.mockResolvedValue(null);
    mcpRuntimeMocks.tabGroupManager.createGroup.mockResolvedValue(undefined);
    mcpRuntimeMocks.tabGroupManager.adoptOrphanedGroup.mockResolvedValue(undefined);
    mcpRuntimeMocks.tabGroupManager.promoteToMainTab.mockResolvedValue(undefined);

    vi.stubGlobal('chrome', {
      runtime: {
        lastError: undefined,
        sendMessage: runtimeSendMessage,
        onMessage: {
          addListener: vi.fn((listener) => {
            messageListener = listener;
          })
        }
      },
      tabs: {
        query: tabsQuery
      }
    });

    registerRuntimeMessageListener(deps);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function dispatchPanelReady() {
    expect(messageListener).toBeDefined();
    return await new Promise<Record<string, unknown>>((resolve) => {
      const handled = messageListener?.({ type: 'PANEL_READY' }, {}, resolve);
      expect(handled).toBe(true);
    });
  }

  async function dispatchCheckNativeHostStatus() {
    expect(messageListener).toBeDefined();
    return await new Promise<Record<string, unknown>>((resolve) => {
      const handled = messageListener?.({ type: 'check_native_host_status' }, {}, resolve);
      expect(handled).toBe(true);
    });
  }

  async function dispatchResetNativeHostConnection() {
    expect(messageListener).toBeDefined();
    return await new Promise<Record<string, unknown>>((resolve) => {
      const handled = messageListener?.({ type: 'reset_native_host_connection' }, {}, resolve);
      expect(handled).toBe(true);
    });
  }

  it('does not create a SuperDuck group when a panel mount lands on an ungrouped workspace tab', async () => {
    mcpRuntimeMocks.tabGroupManager.findGroupByTab.mockResolvedValue(null);

    await expect(dispatchPanelReady()).resolves.toEqual({ success: true });

    expect(sidePanelMocks.incrementPanelAlive).toHaveBeenCalledTimes(1);
    expect(mcpRuntimeMocks.tabGroupManager.initialize).toHaveBeenCalledWith(true);
    expect(mcpRuntimeMocks.tabGroupManager.findGroupByTab).toHaveBeenCalledWith(99);
    expect(mcpRuntimeMocks.tabGroupManager.createGroup).not.toHaveBeenCalled();
    expect(mcpRuntimeMocks.tabGroupManager.adoptOrphanedGroup).not.toHaveBeenCalled();
    expect(mcpRuntimeMocks.tabGroupManager.promoteToMainTab).not.toHaveBeenCalled();
    expect(runtimeSendMessage).not.toHaveBeenCalledWith(
      {
        type: 'SIDE_PANEL_SET_ACTIVE_TAB',
        tabId: 99,
        windowId: 11
      },
      expect.any(Function)
    );
  });

  it('does not adopt an unmanaged Chrome tab group from PANEL_READY', async () => {
    mcpRuntimeMocks.tabGroupManager.findGroupByTab.mockResolvedValue({
      isUnmanaged: true,
      mainTabId: 99,
      chromeGroupId: 5
    });

    await expect(dispatchPanelReady()).resolves.toEqual({ success: true });

    expect(mcpRuntimeMocks.tabGroupManager.createGroup).not.toHaveBeenCalled();
    expect(mcpRuntimeMocks.tabGroupManager.adoptOrphanedGroup).not.toHaveBeenCalled();
    expect(mcpRuntimeMocks.tabGroupManager.promoteToMainTab).not.toHaveBeenCalled();
    expect(runtimeSendMessage).not.toHaveBeenCalled();
  });

  it('only retargets the sidepanel when the active tab is already SuperDuck-managed', async () => {
    mcpRuntimeMocks.tabGroupManager.findGroupByTab.mockResolvedValue({
      isUnmanaged: false,
      mainTabId: 7,
      chromeGroupId: 5
    });

    await expect(dispatchPanelReady()).resolves.toEqual({ success: true });

    expect(mcpRuntimeMocks.tabGroupManager.createGroup).not.toHaveBeenCalled();
    expect(mcpRuntimeMocks.tabGroupManager.adoptOrphanedGroup).not.toHaveBeenCalled();
    expect(mcpRuntimeMocks.tabGroupManager.promoteToMainTab).not.toHaveBeenCalled();
    expect(runtimeSendMessage).toHaveBeenCalledWith(
      {
        type: 'SIDE_PANEL_SET_ACTIVE_TAB',
        tabId: 99,
        windowId: 11
      },
      expect.any(Function)
    );
  });

  it('responds to native-host status checks even when the probe fails', async () => {
    deps.getNativeHostStatus = vi.fn(async () => {
      throw new Error('probe failed');
    });
    mcpRuntimeMocks.isBridgeConnected.mockReturnValue(true);

    await expect(dispatchCheckNativeHostStatus()).resolves.toEqual({
      status: {
        nativeHostInstalled: false,
        mcpConnected: false,
        connecting: false,
        reconnecting: false,
        bridgeConnected: true,
        error: 'probe failed'
      }
    });
  });

  it('reports bridge status separately from native-host MCP status', async () => {
    deps.getNativeHostStatus = vi.fn(async () => ({
      nativeHostInstalled: true,
      mcpConnected: false
    }));
    mcpRuntimeMocks.isBridgeConnected.mockReturnValue(true);

    await expect(dispatchCheckNativeHostStatus()).resolves.toEqual({
      status: {
        nativeHostInstalled: true,
        mcpConnected: false,
        connecting: false,
        reconnecting: false,
        bridgeConnected: true
      }
    });
  });

  it('reports in-progress native-host connections separately from disconnected state', async () => {
    deps.getNativeHostStatus = vi.fn(async () => ({
      nativeHostInstalled: false,
      mcpConnected: false,
      connecting: true
    }));

    await expect(dispatchCheckNativeHostStatus()).resolves.toEqual({
      status: {
        nativeHostInstalled: false,
        mcpConnected: false,
        connecting: true,
        reconnecting: false,
        bridgeConnected: false
      }
    });
  });

  it('resets the native-host connection and returns the latest status', async () => {
    mcpRuntimeMocks.isBridgeConnected.mockReturnValue(true);
    deps.resetNativeHost = vi.fn(async () => ({
      success: true,
      reconnecting: true,
      status: {
        nativeHostInstalled: true,
        mcpConnected: false
      }
    }));

    await expect(dispatchResetNativeHostConnection()).resolves.toEqual({
      success: true,
      reconnecting: true,
      status: {
        nativeHostInstalled: true,
        mcpConnected: false,
        connecting: false,
        reconnecting: true,
        bridgeConnected: true
      }
    });
    expect(deps.resetNativeHost).toHaveBeenCalledTimes(1);
  });

  it('returns reset failures with a panel-friendly status payload', async () => {
    deps.resetNativeHost = vi.fn(async () => ({
      success: false,
      status: {
        nativeHostInstalled: false,
        mcpConnected: false
      }
    }));

    await expect(dispatchResetNativeHostConnection()).resolves.toEqual({
      success: false,
      reconnecting: false,
      status: {
        nativeHostInstalled: false,
        mcpConnected: false,
        connecting: false,
        reconnecting: false,
        bridgeConnected: false
      }
    });
  });

  it('returns reset errors without probing status again', async () => {
    deps.resetNativeHost = vi.fn(async () => {
      throw new Error('reset failed');
    });
    mcpRuntimeMocks.isBridgeConnected.mockReturnValue(true);

    await expect(dispatchResetNativeHostConnection()).resolves.toEqual({
      success: false,
      error: 'reset failed',
      status: {
        nativeHostInstalled: false,
        mcpConnected: false,
        connecting: false,
        reconnecting: false,
        bridgeConnected: true,
        error: 'reset failed'
      }
    });
    expect(deps.getNativeHostStatus).not.toHaveBeenCalled();
  });
});
