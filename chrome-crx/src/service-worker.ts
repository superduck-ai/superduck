import { getStorageValue, removeStorageValues, setStorageValue, StorageKeys } from "./extensionServices";
import {
  connectBridge,
  initializeExtensionPermissions,
  isAgentActive,
  setOnAgentBecameIdle,
  setBridgeToolCallBootWaiter,
  setNavigationGuardBootWaiter,
  tabBadgeManager,
  tabGroupManager,
  trackEvent,
} from "./mcpRuntime";
import {
  handleToolContextAlarm,
  restoreActiveToolContextsFromStorage,
  restoreActiveToolCountFromStorage,
} from "./mcpRuntime/core";
import { restoreGifFrameStorageFromStorage } from "./mcpRuntime/mediaTools/gifFrameStorage";
import { createExtensionUrlHandler } from "./background/extensionUrl";
import { createNativeHostManager } from "./background/nativeHost";
import { registerExternalMessageListener } from "./background/externalMessages";
import { registerRuntimeMessageListener } from "./background/runtimeMessages";
import { createScheduledTaskManager } from "./background/scheduledTasks";
import { createSidePanelController } from "./background/sidePanel";
import { createStaticIndicatorController } from "./background/staticIndicator";
import { createDownloadTracker } from "./background/downloadTracker";

const nativeHostManager = createNativeHostManager({ waitUntilBooted: ensureServiceWorkerBooted });
const sidePanelController = createSidePanelController({
  connectNativeHost: nativeHostManager.connect,
  waitUntilBooted: ensureServiceWorkerBooted,
});
const scheduledTaskManager = createScheduledTaskManager();
const extensionUrlHandler = createExtensionUrlHandler({
  connectNativeHost: nativeHostManager.connect,
  disconnectNativeHost: nativeHostManager.disconnect,
});
const staticIndicatorController = createStaticIndicatorController();
const downloadTracker = createDownloadTracker({
  isAgentActive,
  sendNotification: nativeHostManager.sendMcpNotification,
});

let serviceWorkerBootPromise: Promise<void> | null = null;

// Boot diagnostics: timestamped + persisted counter so the SW panel shows
// how often the SW is re-created. Frequent repeats while the panel is open
// indicate a crash or reload loop, not the normal 30s idle recycling.
void getStorageValue<number>("swBootCount").then((count) => {
  const bootCount = typeof count === 'number' && count >= 0 ? count + 1 : 1;
  void setStorageValue("swBootCount", bootCount);
  console.log(`[superduck] service worker boot #${bootCount} at ${new Date().toISOString()}`);
});

async function runBootStep(label: string, step: () => unknown | Promise<unknown>): Promise<void> {
  try {
    await step();
  } catch (err) {
    console.warn(`[superduck] service worker boot step failed: ${label}`, err);
  }
}

async function ensureServiceWorkerBooted(): Promise<void> {
  if (serviceWorkerBootPromise) return serviceWorkerBootPromise;
  serviceWorkerBootPromise = (async () => {
    await runBootStep("extension permissions initialize", initializeExtensionPermissions);
    void runBootStep("bridge connect", connectBridge);
    void runBootStep("native host connect", nativeHostManager.connect);
    await runBootStep("tab group initialize", async () => {
      await tabGroupManager.initialize();
      tabGroupManager.startTabGroupChangeListener();
    });
    await runBootStep("active tool contexts restore", restoreActiveToolContextsFromStorage);
    await runBootStep("active tool count restore", restoreActiveToolCountFromStorage);
    await runBootStep("gif frame storage restore", restoreGifFrameStorageFromStorage);
    await runBootStep("static indicator deadlines restore", () =>
      staticIndicatorController.restoreTurnActiveDeadlines()
    );
    await runBootStep("pending update replay", replayPendingUpdateIfAny);
    void tabBadgeManager.initialize();
    await runBootStep("scheduled alarms restore", scheduledTaskManager.restoreScheduledAlarms);
  })();
  return serviceWorkerBootPromise;
}

function runAfterServiceWorkerBoot(label: string, action: () => unknown | Promise<unknown>): void {
  void (async () => {
    await ensureServiceWorkerBooted();
    await action();
  })().catch((err) => {
    console.warn(`[superduck] event handler failed after service worker boot: ${label}`, err);
  });
}

setBridgeToolCallBootWaiter(ensureServiceWorkerBooted);
setNavigationGuardBootWaiter(ensureServiceWorkerBooted);

// The manifest declares a default sidepanel path, but the product only wants
// SuperDuck-managed tabs to show it. Keep the default panel disabled and open
// tab-specific panels from explicit user gestures (toolbar click / Ctrl+E).
// Otherwise Chrome can switch from a managed tab-specific instance to the
// default instance on a workspace tab, which remounts the UI and can claim the
// user's workspace.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((err) =>
    console.error("[superduck] setPanelBehavior failed", err)
  );

chrome.sidePanel
  .setOptions({ enabled: false })
  .catch((err) => console.error("[superduck] disable default sidepanel failed", err));

async function handleNotificationClick(notificationId: string) {
  await chrome.notifications.clear(notificationId);

  const parts = notificationId.split("_");
  let tabId: number | null = null;
  if (parts.length >= 2 && parts[1] !== "unknown") {
    tabId = parseInt(parts[1], 10);
  }

  if (tabId && !Number.isNaN(tabId)) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true });
        await chrome.tabs.update(tabId, { active: true });
        return;
      }
    } catch {
      // Tab may no longer exist.
    }
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.windowId) {
    await chrome.windows.update(activeTab.windowId, { focused: true });
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  // Clear both markers before boot: a stale pendingUpdateVersion re-reloads
  // forever, and replayPendingUpdateIfAny reads it during boot.
  await removeStorageValues([StorageKeys.UPDATE_AVAILABLE, StorageKeys.PENDING_UPDATE_VERSION]);

  try {
    chrome.runtime.setUninstallURL("", () => {
      // ignore chrome.runtime.lastError
    });
  } catch {
    // ignore
  }

  await ensureServiceWorkerBooted();

  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    void sidePanelController.openOptionsForSetup().catch(() => {});
  }

  void nativeHostManager.connect();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureServiceWorkerBooted();
});

chrome.permissions.onAdded.addListener((permissions) => {
  if (permissions.permissions?.includes("nativeMessaging")) {
    void nativeHostManager.connect();
  }
});

chrome.permissions.onRemoved.addListener((permissions) => {
  if (permissions.permissions?.includes("nativeMessaging")) {
    void nativeHostManager.disconnect();
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  void handleNotificationClick(notificationId);
});

chrome.action.onClicked.addListener((tab) => {
  void sidePanelController.handleActionClick(tab);
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  runAfterServiceWorkerBoot("tab activated", () =>
    sidePanelController.handleTabActivated(activeInfo)
  );
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-side-panel") return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab) {
      void sidePanelController.handleActionClick(tab);
    }
  });
});

let pendingUpdateVersion: string | null = null;
/** True while a reload is being applied — guards against double-trigger. */
let updateReloadInFlight = false;
/**
 * Serializes marker writes/clears: an onUpdateAvailable write must never
 * interleave with a tryApplyUpdate clear+reload, or the write can land after
 * the clear and resurrect the marker on the next boot.
 */
let updateOperationChain: Promise<void> = Promise.resolve();

function enqueueUpdateOperation(op: () => Promise<void>): void {
  updateOperationChain = updateOperationChain.then(op).catch((err) => {
    console.warn('[superduck] update operation failed', err);
  });
}

/**
 * Consume the pending update marker right before reload, so a subsequent SW
 * boot replay is a no-op (pre-fix this re-reloaded forever). Skipped while
 * an agent is active — the marker must survive for the idle retry.
 */
async function clearPendingUpdate(): Promise<void> {
  pendingUpdateVersion = null;
  await removeStorageValues(StorageKeys.PENDING_UPDATE_VERSION);
}

async function tryApplyUpdate(): Promise<void> {
  if (!pendingUpdateVersion || updateReloadInFlight) return;
  if (isAgentActive()) return;
  updateReloadInFlight = true;
  try {
    await clearPendingUpdate();
    chrome.runtime.reload();
    // reload() is fire-and-forget; if the SW survives (reload didn't take
    // effect), the guard would stick and block all future updates. Reset it
    // after a grace period so a later onUpdateAvailable can retry.
    setTimeout(() => {
      updateReloadInFlight = false;
    }, 5000);
  } catch (err) {
    // Clear failed — reset the guard so a later update can still be applied.
    updateReloadInFlight = false;
    console.warn('[superduck] failed to apply pending update', err);
  }
}

/**
 * On `onStartup`, if the SW was killed between `onUpdateAvailable` firing
 * and `tryApplyUpdate` running, the one-shot event is lost. Re-read the
 * persisted version and re-apply it (idempotent: a fresh
 * `onUpdateAvailable` would be a no-op since `pendingUpdateVersion` is
 * already set, and reload is what we want anyway).
 */
async function replayPendingUpdateIfAny(): Promise<void> {
  if (pendingUpdateVersion) {
    await tryApplyUpdate();
    return;
  }
  const stored = await getStorageValue<string | null>(StorageKeys.PENDING_UPDATE_VERSION);
  if (typeof stored === 'string' && stored.length > 0) {
    pendingUpdateVersion = stored;
    await tryApplyUpdate();
  }
}

setOnAgentBecameIdle(() => {
  enqueueUpdateOperation(async () => {
    await tryApplyUpdate();
  });
});

chrome.runtime.onUpdateAvailable.addListener((details) => {
  pendingUpdateVersion = details.version;
  void trackEvent("superduck.extension.update_available", {
    current_version: chrome.runtime.getManifest().version,
    new_version: details.version,
  });
  enqueueUpdateOperation(async () => {
    // Persist the marker before consuming it: tryApplyUpdate clears storage,
    // so an un-awaited write could land after the clear and survive the
    // reload, re-firing the loop on the next boot. The queue serializes this
    // against tryApplyUpdate, and the in-flight guard bails if a reload was
    // already applied while we were queued.
    // UPDATE_AVAILABLE is intentionally preserved (PRESERVED_KEYS): it is a
    // UI flag cleared by onInstalled after the reload.
    if (updateReloadInFlight) return;
    await setStorageValue(StorageKeys.UPDATE_AVAILABLE, true);
    if (updateReloadInFlight) return;
    await setStorageValue(StorageKeys.PENDING_UPDATE_VERSION, details.version);
    await tryApplyUpdate();
  });
});

registerRuntimeMessageListener({
  openSidePanelRequest: sidePanelController.openSidePanelRequest,
  openOptionsWithTask: sidePanelController.openOptionsWithTask,
  getNativeHostStatus: nativeHostManager.getStatus,
  resetNativeHost: nativeHostManager.reset,
  sendMcpNotification: nativeHostManager.sendMcpNotification,
  executeScheduledTask: scheduledTaskManager.executeScheduledTask,
  waitUntilBooted: ensureServiceWorkerBooted,
  handleStaticIndicatorHeartbeat: async (sender, sendResponse) => {
    await ensureServiceWorkerBooted();
    await staticIndicatorController.handleHeartbeat(sender, sendResponse);
  },
  handleDismissStaticIndicator: async (sender, sendResponse) => {
    await ensureServiceWorkerBooted();
    await staticIndicatorController.dismissForSenderGroup(sender, sendResponse);
  },
  handleAgentTurnActive: async (message, sendResponse) => {
    await ensureServiceWorkerBooted();
    await staticIndicatorController.handleAgentTurnActive(message, sendResponse);
  },
});

chrome.tabs.onRemoved.addListener((tabId) => {
  runAfterServiceWorkerBoot("tab removed", () => tabGroupManager.handleTabClosed(tabId));
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) {
    runAfterServiceWorkerBoot("web navigation before navigate", () =>
      extensionUrlHandler.handleExtensionUrl(details.url, details.tabId)
    );
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "native-host-heartbeat") {
    void nativeHostManager.handleHeartbeatAlarm();
    return;
  }
  void (async () => {
    await ensureServiceWorkerBooted();
    if (await handleToolContextAlarm(alarm.name)) return;
    if (await staticIndicatorController.handleAlarm(alarm.name)) return;
    await scheduledTaskManager.handleAlarm(alarm);
  })();
});

registerExternalMessageListener({
  connectNativeHost: nativeHostManager.connect,
});

chrome.downloads.onCreated.addListener((item) => {
  runAfterServiceWorkerBoot("download created", () => downloadTracker.handleDownloadCreated(item));
});

chrome.downloads.onChanged.addListener((delta) => {
  runAfterServiceWorkerBoot("download changed", () => downloadTracker.handleDownloadChanged(delta));
});

void ensureServiceWorkerBooted();
