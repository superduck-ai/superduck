import { beforeEach, describe, expect, it, vi } from 'vitest';

function createEvent() {
  const listeners: Array<(...args: unknown[]) => unknown> = [];
  return {
    listeners,
    addListener: vi.fn((listener: (...args: unknown[]) => unknown) => {
      listeners.push(listener);
    })
  };
}

const fixtures = vi.hoisted(() => {
  const makeEvent = () => {
    const listeners: Array<(...args: unknown[]) => unknown> = [];
    return {
      listeners,
      addListener: vi.fn((listener: (...args: unknown[]) => unknown) => {
        listeners.push(listener);
      })
    };
  };
  const onInstalled = makeEvent();
  const onStartup = makeEvent();
  const onUpdateAvailable = makeEvent();
  const onAlarm = makeEvent();
  const scheduledTaskHandleAlarm = vi.fn();
  return {
    onInstalled,
    onStartup,
    onUpdateAvailable,
    onAlarm,
    connectBridge: vi.fn(),
    setBridgeToolCallBootWaiter: vi.fn(),
    setNavigationGuardBootWaiter: vi.fn(),
    initializeExtensionPermissions: vi.fn(),
    restoreActiveToolContextsFromStorage: vi.fn(),
    restoreActiveToolCountFromStorage: vi.fn(),
    restoreGifFrameStorageFromStorage: vi.fn(),
    tabGroupInitialize: vi.fn(),
    startTabGroupChangeListener: vi.fn(),
    tabBadgeInitialize: vi.fn(),
    nativeConnect: vi.fn(),
    nativeDisconnect: vi.fn(),
    nativeHeartbeat: vi.fn(),
    scheduledTaskRestore: vi.fn(),
    scheduledTaskHandleAlarm,
    handleToolContextAlarm: vi.fn(),
    registerRuntimeMessageListener: vi.fn(),
    registerExternalMessageListener: vi.fn(),
    openOptionsForSetup: vi.fn(async () => {}),
    sidePanelAction: vi.fn(),
    sidePanelActivated: vi.fn(),
    handleStaticHeartbeat: vi.fn(),
    handleStaticDismiss: vi.fn(),
    handleAgentTurnActive: vi.fn(),
    restoreTurnActiveDeadlines: vi.fn(),
    handleStaticIndicatorAlarm: vi.fn(),
    handleTabClosed: vi.fn(),
    handleExtensionUrl: vi.fn(),
    downloadCreated: vi.fn(),
    downloadChanged: vi.fn(),
    trackEvent: vi.fn(),
    setOnAgentBecameIdle: vi.fn(),
    isAgentActive: vi.fn(() => false)
  };
});

/**
 * Minimal fake of chrome.storage.local for simulating SW restart cycles:
 * storage survives, in-memory state does not.
 */
function createStorageLocalMock() {
  const store: Record<string, unknown> = {};
  return {
    set: vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(store, values);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) delete store[k];
    }),
    _store: store
  };
}

vi.mock('./extensionServices', () => ({
  StorageKeys: {
    PENDING_UPDATE_VERSION: 'pendingUpdateVersion',
    UPDATE_AVAILABLE: 'updateAvailable'
  },
  // Route reads/writes through the storage fake so onUpdateAvailable
  // persistence and cold-boot replay see the same store, exercising the real
  // write-then-consume ordering.
  getStorageValue: vi.fn(async (key: string) => storageLocalMock._store[key]),
  setStorageValue: vi.fn(async (key: string, value: unknown) => {
    await storageLocalMock.set({ [key]: value });
  }),
  removeStorageValues: vi.fn(async (keys: string | string[]) => {
    await storageLocalMock.remove(keys);
  })
}));

vi.mock('./mcpRuntime', () => ({
  connectBridge: fixtures.connectBridge,
  setBridgeToolCallBootWaiter: fixtures.setBridgeToolCallBootWaiter,
  setNavigationGuardBootWaiter: fixtures.setNavigationGuardBootWaiter,
  initializeExtensionPermissions: fixtures.initializeExtensionPermissions,
  isAgentActive: fixtures.isAgentActive,
  setOnAgentBecameIdle: fixtures.setOnAgentBecameIdle,
  tabBadgeManager: {
    initialize: fixtures.tabBadgeInitialize
  },
  tabGroupManager: {
    initialize: fixtures.tabGroupInitialize,
    startTabGroupChangeListener: fixtures.startTabGroupChangeListener,
    handleTabClosed: fixtures.handleTabClosed
  },
  trackEvent: fixtures.trackEvent
}));

vi.mock('./mcpRuntime/core', () => ({
  handleToolContextAlarm: fixtures.handleToolContextAlarm,
  restoreActiveToolContextsFromStorage: fixtures.restoreActiveToolContextsFromStorage,
  restoreActiveToolCountFromStorage: fixtures.restoreActiveToolCountFromStorage
}));

vi.mock('./mcpRuntime/mediaTools/gifFrameStorage', () => ({
  restoreGifFrameStorageFromStorage: fixtures.restoreGifFrameStorageFromStorage
}));

vi.mock('./background/extensionUrl', () => ({
  createExtensionUrlHandler: vi.fn(() => ({
    handleExtensionUrl: fixtures.handleExtensionUrl
  }))
}));

vi.mock('./background/nativeHost', () => ({
  createNativeHostManager: vi.fn(() => ({
    connect: fixtures.nativeConnect,
    disconnect: fixtures.nativeDisconnect,
    getStatus: vi.fn(),
    reset: vi.fn(),
    sendMcpNotification: vi.fn(),
    handleHeartbeatAlarm: fixtures.nativeHeartbeat
  }))
}));

vi.mock('./background/externalMessages', () => ({
  registerExternalMessageListener: fixtures.registerExternalMessageListener
}));

vi.mock('./background/runtimeMessages', () => ({
  registerRuntimeMessageListener: fixtures.registerRuntimeMessageListener
}));

vi.mock('./background/scheduledTasks', () => ({
  createScheduledTaskManager: vi.fn(() => ({
    restoreScheduledAlarms: fixtures.scheduledTaskRestore,
    executeScheduledTask: vi.fn(),
    handleAlarm: fixtures.scheduledTaskHandleAlarm
  }))
}));

vi.mock('./background/sidePanel', () => ({
  createSidePanelController: vi.fn(() => ({
    openOptionsForSetup: fixtures.openOptionsForSetup,
    handleActionClick: fixtures.sidePanelAction,
    handleTabActivated: fixtures.sidePanelActivated,
    openSidePanelRequest: vi.fn(),
    openOptionsWithTask: vi.fn()
  }))
}));

vi.mock('./background/staticIndicator', () => ({
  createStaticIndicatorController: vi.fn(() => ({
    handleHeartbeat: fixtures.handleStaticHeartbeat,
    dismissForSenderGroup: fixtures.handleStaticDismiss,
    handleAgentTurnActive: fixtures.handleAgentTurnActive,
    restoreTurnActiveDeadlines: fixtures.restoreTurnActiveDeadlines,
    handleAlarm: fixtures.handleStaticIndicatorAlarm
  }))
}));

vi.mock('./background/downloadTracker', () => ({
  createDownloadTracker: vi.fn(() => ({
    handleDownloadCreated: fixtures.downloadCreated,
    handleDownloadChanged: fixtures.downloadChanged
  }))
}));

const storageLocalMock = createStorageLocalMock();

const chromeMock = {
  storage: {
    local: storageLocalMock
  },
  runtime: {
    OnInstalledReason: { INSTALL: 'install' },
    onInstalled: fixtures.onInstalled,
    onStartup: fixtures.onStartup,
    onUpdateAvailable: fixtures.onUpdateAvailable,
    setUninstallURL: vi.fn((_url: string, cb: () => void) => cb()),
    reload: vi.fn(),
    getManifest: vi.fn(() => ({ version: '0.0.0-test' }))
  },
  sidePanel: {
    setPanelBehavior: vi.fn(async () => {}),
    setOptions: vi.fn(async () => {})
  },
  permissions: {
    onAdded: createEvent(),
    onRemoved: createEvent()
  },
  notifications: {
    clear: vi.fn(async () => true),
    onClicked: createEvent()
  },
  action: {
    onClicked: createEvent()
  },
  tabs: {
    query: vi.fn(async () => []),
    update: vi.fn(async () => ({})),
    onActivated: createEvent(),
    onRemoved: createEvent()
  },
  windows: {
    update: vi.fn(async () => ({}))
  },
  commands: {
    onCommand: createEvent()
  },
  webNavigation: {
    onBeforeNavigate: createEvent()
  },
  alarms: {
    onAlarm: fixtures.onAlarm
  },
  downloads: {
    onCreated: createEvent(),
    onChanged: createEvent()
  }
};

vi.stubGlobal('chrome', chromeMock);

describe('service worker cold-start boot', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    for (const event of [
      fixtures.onInstalled,
      fixtures.onStartup,
      fixtures.onUpdateAvailable,
      fixtures.onAlarm,
      chromeMock.permissions.onAdded,
      chromeMock.permissions.onRemoved,
      chromeMock.notifications.onClicked,
      chromeMock.action.onClicked,
      chromeMock.tabs.onActivated,
      chromeMock.tabs.onRemoved,
      chromeMock.commands.onCommand,
      chromeMock.webNavigation.onBeforeNavigate,
      chromeMock.downloads.onCreated,
      chromeMock.downloads.onChanged
    ]) {
      event.listeners.length = 0;
    }
    fixtures.restoreActiveToolContextsFromStorage.mockResolvedValue(undefined);
    fixtures.restoreActiveToolCountFromStorage.mockResolvedValue(undefined);
    fixtures.restoreGifFrameStorageFromStorage.mockResolvedValue(undefined);
    fixtures.tabGroupInitialize.mockResolvedValue(undefined);
    fixtures.tabBadgeInitialize.mockResolvedValue(undefined);
    fixtures.nativeConnect.mockResolvedValue(undefined);
    fixtures.scheduledTaskRestore.mockResolvedValue(undefined);
    fixtures.handleToolContextAlarm.mockResolvedValue(false);
    fixtures.restoreTurnActiveDeadlines.mockResolvedValue(undefined);
    fixtures.handleStaticIndicatorAlarm.mockResolvedValue(false);
    fixtures.isAgentActive.mockReturnValue(false);
    // storage survives across simulated SW restarts, but must start clean
    for (const k of Object.keys(storageLocalMock._store)) delete storageLocalMock._store[k];
  });

  it('rehydrates runtime state on ordinary service-worker wake without waiting for onStartup', async () => {
    await import('./service-worker');

    await vi.waitFor(() => {
      expect(fixtures.restoreActiveToolContextsFromStorage).toHaveBeenCalled();
      expect(fixtures.restoreActiveToolCountFromStorage).toHaveBeenCalled();
      expect(fixtures.restoreGifFrameStorageFromStorage).toHaveBeenCalled();
      expect(fixtures.restoreTurnActiveDeadlines).toHaveBeenCalled();
    });

    expect(fixtures.onStartup.listeners).toHaveLength(1);
    expect(fixtures.tabGroupInitialize).toHaveBeenCalled();
    expect(fixtures.tabGroupInitialize.mock.invocationCallOrder[0]).toBeLessThan(
      fixtures.restoreActiveToolContextsFromStorage.mock.invocationCallOrder[0]
    );
    expect(fixtures.startTabGroupChangeListener).toHaveBeenCalled();
    expect(fixtures.tabBadgeInitialize).toHaveBeenCalled();
    expect(fixtures.scheduledTaskRestore).toHaveBeenCalled();
    expect(fixtures.setBridgeToolCallBootWaiter).toHaveBeenCalledWith(expect.any(Function));
    expect(fixtures.setNavigationGuardBootWaiter).toHaveBeenCalledWith(expect.any(Function));
  });

  it('continues boot and connects the native channel when one restore step fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fixtures.restoreActiveToolContextsFromStorage.mockRejectedValueOnce(new Error('restore boom'));
    try {
      await import('./service-worker');

      await vi.waitFor(() => {
        expect(fixtures.connectBridge).toHaveBeenCalled();
        expect(fixtures.nativeConnect).toHaveBeenCalled();
        expect(fixtures.restoreActiveToolCountFromStorage).toHaveBeenCalled();
        expect(fixtures.restoreGifFrameStorageFromStorage).toHaveBeenCalled();
        expect(fixtures.restoreTurnActiveDeadlines).toHaveBeenCalled();
        expect(fixtures.scheduledTaskRestore).toHaveBeenCalled();
      });
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('waits for cold-start restore before handling tool-context alarms', async () => {
    let resolveRestore!: () => void;
    fixtures.restoreActiveToolContextsFromStorage.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRestore = resolve;
      })
    );
    await import('./service-worker');
    fixtures.handleToolContextAlarm.mockResolvedValueOnce(true);

    fixtures.onAlarm.listeners[0]({ name: 'superduck.toolContext.debuggerDetach:tab:7' });
    await Promise.resolve();

    expect(fixtures.handleToolContextAlarm).not.toHaveBeenCalled();

    resolveRestore();
    await vi.waitFor(() => {
      expect(fixtures.handleToolContextAlarm).toHaveBeenCalledWith(
        'superduck.toolContext.debuggerDetach:tab:7'
      );
    });
  });

  it('waits for cold-start restore before handling tab removal events', async () => {
    let resolveRestore!: () => void;
    fixtures.restoreActiveToolContextsFromStorage.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRestore = resolve;
      })
    );
    await import('./service-worker');

    chromeMock.tabs.onRemoved.listeners[0](7);
    await Promise.resolve();

    expect(fixtures.handleTabClosed).not.toHaveBeenCalled();

    resolveRestore();
    await vi.waitFor(() => {
      expect(fixtures.handleTabClosed).toHaveBeenCalledWith(7);
    });
  });

  it('waits for cold-start restore before handling main-frame extension navigation events', async () => {
    let resolveRestore!: () => void;
    fixtures.restoreActiveToolContextsFromStorage.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRestore = resolve;
      })
    );
    await import('./service-worker');

    chromeMock.webNavigation.onBeforeNavigate.listeners[0]({
      frameId: 0,
      tabId: 12,
      url: 'chrome-extension://abc/options.html'
    });
    await Promise.resolve();

    expect(fixtures.handleExtensionUrl).not.toHaveBeenCalled();

    resolveRestore();
    await vi.waitFor(() => {
      expect(fixtures.handleExtensionUrl).toHaveBeenCalledWith(
        'chrome-extension://abc/options.html',
        12
      );
    });
  });

  it('registers a bridge tool-call waiter that waits for cold-start restore', async () => {
    let resolveRestore!: () => void;
    fixtures.restoreActiveToolContextsFromStorage.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRestore = resolve;
      })
    );
    await import('./service-worker');
    const waiter = fixtures.setBridgeToolCallBootWaiter.mock.calls[0]?.[0] as
      | (() => Promise<void>)
      | undefined;
    expect(waiter).toBeTypeOf('function');

    let resolved = false;
    const waitPromise = waiter!().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    resolveRestore();
    await waitPromise;
    expect(resolved).toBe(true);
  });

  it('routes tool-context alarms before scheduled task alarms', async () => {
    await import('./service-worker');
    fixtures.handleToolContextAlarm.mockResolvedValueOnce(true);

    fixtures.onAlarm.listeners[0]({ name: 'superduck.toolContext.debuggerDetach:tab:7' });

    await vi.waitFor(() => {
      expect(fixtures.handleToolContextAlarm).toHaveBeenCalledWith(
        'superduck.toolContext.debuggerDetach:tab:7'
      );
    });
    expect(fixtures.scheduledTaskHandleAlarm).not.toHaveBeenCalled();
  });

  it('routes static indicator turn-active alarms before scheduled task alarms', async () => {
    await import('./service-worker');
    fixtures.handleToolContextAlarm.mockResolvedValueOnce(false);
    fixtures.handleStaticIndicatorAlarm.mockResolvedValueOnce(true);

    fixtures.onAlarm.listeners[0]({ name: 'superduck.turnActive.7' });

    await vi.waitFor(() => {
      expect(fixtures.handleStaticIndicatorAlarm).toHaveBeenCalledWith('superduck.turnActive.7');
    });
    expect(fixtures.scheduledTaskHandleAlarm).not.toHaveBeenCalled();
  });

  describe('update reload guard', () => {
    /**
     * Full update lifecycle: onUpdateAvailable fires → reload → SW restarts
     * → boot replays the persisted marker. Pre-fix, the marker was never
     * consumed, so every SW wake re-fired reload() — the "reloads itself too
     * frequently" loop. The fix must consume it before reloading so a
     * subsequent boot replay is a no-op.
     */
    it('clears the persisted pending update version before reloading', async () => {
      await import('./service-worker');

      fixtures.onUpdateAvailable.listeners[0]({ version: '1.1.0' });

      await vi.waitFor(() => {
        expect(chromeMock.runtime.reload).toHaveBeenCalledTimes(1);
      });

      // SW restart: storage survives, in-memory pendingUpdateVersion is gone.
      await vi.resetModules();
      await import('./service-worker');

      await vi.waitFor(() => {
        expect(chromeMock.runtime.reload).toHaveBeenCalledTimes(1);
      });
      // The marker was consumed (cleared) by the first reload — the replay
      // must not re-fire reload.
      expect(storageLocalMock._store['pendingUpdateVersion']).toBeUndefined();
    });

    it('does not reload while an agent is active, and applies once it becomes idle', async () => {
      fixtures.isAgentActive.mockReturnValue(true);
      await import('./service-worker');

      fixtures.onUpdateAvailable.listeners[0]({ version: '1.1.0' });
      expect(chromeMock.runtime.reload).not.toHaveBeenCalled();

      // onUpdateAvailable now persists the marker before consuming it (async
      // closure), so the idle callback and the closure can both reach
      // tryApplyUpdate. Exactly one reload must happen — a second would mean
      // the marker was not atomically consumed.
      fixtures.isAgentActive.mockReturnValue(false);
      const idleCallback = fixtures.setOnAgentBecameIdle.mock.calls[0]?.[0];
      expect(idleCallback).toBeTypeOf('function');
      idleCallback!();

      await vi.waitFor(() => {
        expect(chromeMock.runtime.reload).toHaveBeenCalledTimes(1);
      });
      // Give the async closure time to settle; it must not re-fire reload.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(chromeMock.runtime.reload).toHaveBeenCalledTimes(1);
    });

    it('recovers when clearing the marker fails, so a later update still applies', async () => {
      // First update: clearing storage rejects → reload must not happen and
      // the in-flight guard must reset.
      storageLocalMock.remove.mockRejectedValueOnce(new Error('storage boom'));
      await import('./service-worker');

      fixtures.onUpdateAvailable.listeners[0]({ version: '1.1.0' });
      await vi.waitFor(() => {
        expect(storageLocalMock.remove).toHaveBeenCalled();
      });
      expect(chromeMock.runtime.reload).not.toHaveBeenCalled();

      // Second update: storage healthy again → reload happens, proving the
      // guard was not left stuck.
      fixtures.onUpdateAvailable.listeners[0]({ version: '1.2.0' });
      await vi.waitFor(() => {
        expect(chromeMock.runtime.reload).toHaveBeenCalledTimes(1);
      });
    });

    it('onInstalled clears stale update state from previous versions', async () => {
      storageLocalMock._store['pendingUpdateVersion'] = '9.9.9';
      storageLocalMock._store['updateAvailable'] = true;
      await import('./service-worker');

      fixtures.onInstalled.listeners[0]({ reason: chromeMock.runtime.OnInstalledReason.INSTALL });

      await vi.waitFor(() => {
        expect(storageLocalMock.remove).toHaveBeenCalledWith(
          expect.arrayContaining(['updateAvailable', 'pendingUpdateVersion'])
        );
      });
    });
  });
});
