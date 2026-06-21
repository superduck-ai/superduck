import { getStorageValue, setStorageValue, StorageKeys } from "./extensionServices";
import {
  connectBridge,
  initializeExtensionPermissions,
  isAgentActive,
  setOnAgentBecameIdle,
  tabGroupManager,
  trackEvent,
} from "./mcpRuntime";
import { restoreActiveToolContextsFromStorage, restoreActiveToolCountFromStorage } from "./mcpRuntime/core";
import { restoreGifFrameStorageFromStorage } from "./mcpRuntime/mediaTools";
import { createExtensionUrlHandler } from "./background/extensionUrl";
import { createNativeHostManager } from "./background/nativeHost";
import { registerExternalMessageListener } from "./background/externalMessages";
import { registerRuntimeMessageListener } from "./background/runtimeMessages";
import { createScheduledTaskManager } from "./background/scheduledTasks";
import { createSidePanelController } from "./background/sidePanel";
import { createStaticIndicatorController } from "./background/staticIndicator";
import { createDownloadTracker } from "./background/downloadTracker";

const nativeHostManager = createNativeHostManager();
const sidePanelController = createSidePanelController({
  connectNativeHost: nativeHostManager.connect,
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

void connectBridge();
void nativeHostManager.connect();

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
  chrome.storage.local.remove(["updateAvailable"]);

  try {
    chrome.runtime.setUninstallURL("", () => {
      // ignore chrome.runtime.lastError
    });
  } catch {
    // ignore
  }

  initializeExtensionPermissions();
  await tabGroupManager.initialize();

  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    void sidePanelController.openOptionsForSetup().catch(() => {});
  }

  void nativeHostManager.connect();
  await scheduledTaskManager.restoreScheduledAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  initializeExtensionPermissions();
  await restoreActiveToolContextsFromStorage();
  await restoreActiveToolCountFromStorage();
  await restoreGifFrameStorageFromStorage();
  // Replay any pending update that arrived while the SW was killed —
  // onUpdateAvailable is a one-shot event and is not redelivered.
  await replayPendingUpdateIfAny();
  await tabGroupManager.initialize();
  // Re-register the tab group change listener. MV3 service-worker
  // listeners do not survive a restart, and the previous flow waited
  // for the next mcp_connected message — sometimes hours or never —
  // leaving tab events silently dropped. The listener is idempotent
  // in the `tabGroupManager` wrapper, and the underlying
  // `TabEventManager` singleton is fresh in the new SW so no
  // double-registration can occur here.
  tabGroupManager.startTabGroupChangeListener();
  void connectBridge();
  void nativeHostManager.connect();
  await scheduledTaskManager.restoreScheduledAlarms();
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
  void sidePanelController.handleTabActivated(activeInfo);
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

function tryApplyUpdate() {
  if (!pendingUpdateVersion) return;
  if (isAgentActive()) return;
  chrome.runtime.reload();
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
    tryApplyUpdate();
    return;
  }
  const stored = await getStorageValue<string | null>(StorageKeys.PENDING_UPDATE_VERSION);
  if (typeof stored === 'string' && stored.length > 0) {
    pendingUpdateVersion = stored;
    tryApplyUpdate();
  }
}

setOnAgentBecameIdle(() => tryApplyUpdate());

chrome.runtime.onUpdateAvailable.addListener((details) => {
  pendingUpdateVersion = details.version;
  void setStorageValue(StorageKeys.UPDATE_AVAILABLE, true);
  void setStorageValue(StorageKeys.PENDING_UPDATE_VERSION, details.version);
  void trackEvent("superduck.extension.update_available", {
    current_version: chrome.runtime.getManifest().version,
    new_version: details.version,
  });
  tryApplyUpdate();
});

registerRuntimeMessageListener({
  openSidePanelRequest: sidePanelController.openSidePanelRequest,
  openOptionsWithTask: sidePanelController.openOptionsWithTask,
  getNativeHostStatus: nativeHostManager.getStatus,
  resetNativeHost: nativeHostManager.reset,
  sendMcpNotification: nativeHostManager.sendMcpNotification,
  executeScheduledTask: scheduledTaskManager.executeScheduledTask,
  handleStaticIndicatorHeartbeat: staticIndicatorController.handleHeartbeat,
  handleDismissStaticIndicator: staticIndicatorController.dismissForSenderGroup,
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void tabGroupManager.handleTabClosed(tabId);
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) {
    void extensionUrlHandler.handleExtensionUrl(details.url, details.tabId);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "native-host-heartbeat") {
    void nativeHostManager.handleHeartbeatAlarm();
    return;
  }
  void scheduledTaskManager.handleAlarm(alarm);
});

registerExternalMessageListener({
  connectNativeHost: nativeHostManager.connect,
});

chrome.downloads.onCreated.addListener((item) => {
  downloadTracker.handleDownloadCreated(item);
});

chrome.downloads.onChanged.addListener((delta) => {
  downloadTracker.handleDownloadChanged(delta);
});
