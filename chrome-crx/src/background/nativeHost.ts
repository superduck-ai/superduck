import {
  getStoredSharedAnalyticsId,
  setSharedAnalyticsId,
  setStorageValue,
  StorageKeys
} from '../extensionServices';
import {
  reconnectMcp,
  connectBridge,
  tabGroupManager,
  createErrorResponse,
  executeTool
} from '../mcpRuntime';
import { ReconnectScheduler } from './ReconnectScheduler';

const NATIVE_HOST_NAMES = [
  'com.me.superduck_browser_extension',
  'com.me.superduck_code_browser_extension'
] as const;

const HEARTBEAT_ALARM = 'native-host-heartbeat';
const HEARTBEAT_TIMEOUT_MS = 3000;
// Must exceed the documented `computer.wait` maximum of 30s, with headroom
// for native-message routing and result serialization.
const DEFAULT_TOOL_REQUEST_TIMEOUT_MS = 35_000;
const BROWSER_BATCH_CHILD_ACTION_TIMEOUT_MS = 15_000;
const MAX_TOOL_REQUEST_TIMEOUT_MS = 5 * 60_000;

// Reconnect backoff schedule (ms). Stops retrying after the last entry.
// First delay is 200ms — native host is a local process, reconnection is
// essentially instant. Short backoff avoids tight loops if binary is missing.
const RECONNECT_DELAYS = [200, 1_000, 3_000, 5_000];

type NativeMessage = { type: string; [key: string]: unknown };
type ToolRequestMessage = {
  method?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
};
type ToolRequestTimeout = { timedOut: true };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getBrowserBatchActionCount(args: Record<string, unknown>): number {
  return Array.isArray(args.actions) ? args.actions.length : 0;
}

function getToolRequestTimeoutMs(toolName: string, args: Record<string, unknown>): number {
  if (toolName !== 'browser_batch') return DEFAULT_TOOL_REQUEST_TIMEOUT_MS;
  const actionCount = getBrowserBatchActionCount(args);
  if (actionCount === 0) return DEFAULT_TOOL_REQUEST_TIMEOUT_MS;
  return Math.min(
    DEFAULT_TOOL_REQUEST_TIMEOUT_MS + actionCount * BROWSER_BATCH_CHILD_ACTION_TIMEOUT_MS,
    MAX_TOOL_REQUEST_TIMEOUT_MS
  );
}

function withToolRequestTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T | ToolRequestTimeout> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<ToolRequestTimeout>((resolve) => {
    timeoutId = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

export interface NativeHostStatus {
  nativeHostInstalled: boolean;
  mcpConnected: boolean;
  connecting?: boolean;
  reconnecting?: boolean;
}

export interface NativeHostResetResult {
  success: boolean;
  status: NativeHostStatus;
  reconnecting?: boolean;
}

export interface NativeHostManager {
  connect: () => Promise<boolean>;
  disconnect: () => Promise<boolean>;
  reset: () => Promise<NativeHostResetResult>;
  getStatus: () => Promise<NativeHostStatus>;
  sendMcpNotification: (method: string, params?: Record<string, unknown>) => boolean;
  handleHeartbeatAlarm: () => Promise<void>;
}

export function createNativeHostManager(): NativeHostManager {
  let nativePort: chrome.runtime.Port | null = null;
  let isConnecting = false;
  let nativeHostInstalled = false;
  let mcpConnected = false;
  let statusResolve: ((value: NativeHostStatus) => void) | null = null;
  let statusTimeout: ReturnType<typeof setTimeout> | null = null;
  let statusPromise: Promise<NativeHostStatus> | null = null;
  let heartbeatResolve: ((alive: boolean) => void) | null = null;
  let heartbeatInFlight = false;
  let explicitDisconnect = false;
  let disconnectHandler: (() => void) | null = null;
  let connectionGeneration = 0;
  let connectAttemptId = 0;

  const reconnectScheduler = new ReconnectScheduler(RECONNECT_DELAYS, () => {
    // Don't gate on nativeHostInstalled — after a service worker restart
    // it resets to false, which would silently kill the retry chain.
    // Only explicit disconnect should stop auto-reconnect.
    if (explicitDisconnect) return;
    console.warn('[nativeHost] auto-reconnect: attempting to reconnect...');
    void connect(true);
  });

  function handleDisconnectError(message?: string) {
    if (message?.includes('native messaging host not found')) {
      nativeHostInstalled = false;
    }
  }

  function parseOptionalInt(value: unknown): number | undefined {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  function currentStatus(): NativeHostStatus {
    const status: NativeHostStatus = { nativeHostInstalled, mcpConnected };
    if (isConnecting && !nativePort) status.connecting = true;
    if (reconnectScheduler.isPending && nativeHostInstalled) status.reconnecting = true;
    return status;
  }

  function resolveStatus(value: NativeHostStatus = currentStatus()) {
    if (statusTimeout) {
      clearTimeout(statusTimeout);
      statusTimeout = null;
    }
    const resolve = statusResolve;
    statusResolve = null;
    statusPromise = null;
    resolve?.(value);
  }

  function buildErrorToolResponse(content: string | unknown[]) {
    const permissionDeniedSuffix =
      'IMPORTANT: The user has explicitly declined this action. Do not attempt to use other tools or workarounds. Instead, acknowledge the denial and ask the user how they would prefer to proceed.';

    const errorContent =
      typeof content === 'string'
        ? content.includes('Permission denied by user')
          ? `${content} - ${permissionDeniedSuffix}`
          : content
        : content.map((item) => {
            if (
              typeof item === 'object' &&
              item !== null &&
              'text' in item &&
              typeof item.text === 'string' &&
              item.text.includes('Permission denied by user')
            ) {
              return { ...item, text: `${item.text} - ${permissionDeniedSuffix}` };
            }
            return item;
          });

    return { type: 'tool_response', error: { content: errorContent } };
  }

  function sendToolResponse({
    content,
    isError,
    is_error: isErrorLegacy
  }: {
    content: string | unknown[];
    isError?: boolean;
    is_error?: boolean;
  }) {
    if (!nativePort) return;
    if (!content || (typeof content !== 'string' && !Array.isArray(content))) return;

    const response =
      (isError ?? isErrorLegacy)
        ? buildErrorToolResponse(content)
        : { type: 'tool_response', result: { content } };

    try {
      nativePort.postMessage(response);
    } catch {
      /* disconnected while responding */
    }
  }

  async function setMcpConnectionState(connected: boolean) {
    mcpConnected = connected;
    void setStorageValue(StorageKeys.MCP_CONNECTED, connected);
    if (connected) {
      await tabGroupManager.initialize();
      tabGroupManager.startTabGroupChangeListener();
    } else {
      tabGroupManager.stopTabGroupChangeListener();
    }
  }

  async function handleToolRequest(message: ToolRequestMessage) {
    try {
      const method = message.method;
      const params = message.params;

      if (method !== 'execute_tool') {
        sendToolResponse({ content: `Unknown method: ${method}` });
        return;
      }

      if (!params || typeof params.tool !== 'string') {
        sendToolResponse(createErrorResponse('No tool specified'));
        return;
      }

      const args = isRecord(params.args) ? params.args : {};
      const clientId = typeof params.client_id === 'string' ? params.client_id : undefined;

      const timeoutMs = getToolRequestTimeoutMs(params.tool, args);
      const result = await withToolRequestTimeout(
        executeTool({
          toolName: params.tool,
          args,
          tabId: parseOptionalInt(args.tabId),
          tabGroupId: parseOptionalInt(args.tabGroupId),
          clientId,
          source: 'native-messaging',
          permissionMode: 'skip_all_permission_checks'
        }),
        timeoutMs
      );

      if ('timedOut' in result) {
        sendToolResponse(
          createErrorResponse(`Tool execution timed out after ${timeoutMs / 1000}s: ${params.tool}`)
        );
        return;
      }

      sendToolResponse({
        content: result.content ?? '',
        isError: result.is_error
      });
    } catch (err) {
      sendToolResponse(
        createErrorResponse(
          `Tool execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`
        )
      );
    }
  }

  async function handleNativeMessage(message: NativeMessage) {
    switch (message.type) {
      case 'tool_request':
        await handleToolRequest(message);
        break;

      case 'pong':
        if (heartbeatResolve) {
          heartbeatResolve(true);
          heartbeatResolve = null;
        }
        break;

      case 'status_response':
        if (typeof message.mcpConnected === 'boolean') {
          await setMcpConnectionState(message.mcpConnected);
        } else if (typeof message.mcp_connected === 'boolean') {
          await setMcpConnectionState(message.mcp_connected);
        }
        resolveStatus();
        break;

      case 'analytics_id_response':
        if (typeof message.distinct_id === 'string') {
          await setSharedAnalyticsId(message.distinct_id);
        }
        break;

      case 'mcp_connected':
        await setMcpConnectionState(true);
        break;

      case 'mcp_disconnected':
        await setMcpConnectionState(false);
        break;
    }
  }

  function startHeartbeat() {
    chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 0.5 });
  }

  function stopHeartbeat() {
    chrome.alarms.clear(HEARTBEAT_ALARM);
  }

  async function detachDebuggerTargets() {
    try {
      const targets = await chrome.debugger.getTargets();
      await Promise.allSettled(
        targets
          .filter((t) => t.attached && typeof t.tabId === 'number')
          .map((t) => chrome.debugger.detach({ tabId: t.tabId! }).catch(() => {}))
      );
    } catch (err) {
      console.warn('[nativeHost] cleanup: debugger detach failed', err);
    }
  }

  async function recycleNativePort({
    detachDebugger = false,
    reconnectBridge = true,
    scheduleReconnect = true
  }: {
    detachDebugger?: boolean;
    reconnectBridge?: boolean;
    scheduleReconnect?: boolean;
  } = {}) {
    stopHeartbeat();
    heartbeatResolve?.(false);
    heartbeatResolve = null;

    const deadPort = nativePort;
    nativePort = null;
    mcpConnected = false;
    resolveStatus();
    void setStorageValue(StorageKeys.MCP_CONNECTED, false);

    if (deadPort && disconnectHandler) {
      try {
        deadPort.onDisconnect.removeListener(disconnectHandler);
      } catch {
        /* port already disconnected */
      }
    }
    disconnectHandler = null;

    try {
      deadPort?.disconnect();
    } catch {
      /* port already disconnected */
    }

    if (detachDebugger) {
      await detachDebuggerTargets();
    }

    tabGroupManager.stopTabGroupChangeListener();
    if (reconnectBridge) reconnectMcp();
    if (scheduleReconnect && !explicitDisconnect) reconnectScheduler.schedule();
  }

  async function handleHeartbeatAlarm(): Promise<void> {
    if (!nativePort) return;
    if (heartbeatInFlight) return;
    heartbeatInFlight = true;

    try {
      const portAtStart = nativePort;

      const timeout = new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(false), HEARTBEAT_TIMEOUT_MS)
      );
      const ping = new Promise<boolean>((resolve) => {
        heartbeatResolve = resolve;
        try {
          nativePort!.postMessage({ type: 'ping' });
        } catch {
          resolve(false);
        }
      });

      const alive = await Promise.race([timeout, ping]);
      if (alive) return;

      // If the port was replaced by auto-reconnect while we were awaiting,
      // bail out — the new port is healthy and must not be killed.
      if (nativePort !== portAtStart) return;

      console.warn('[nativeHost] heartbeat timed out; recycling native port');
      await recycleNativePort({ detachDebugger: true });
    } finally {
      heartbeatResolve = null;
      heartbeatInFlight = false;
    }
  }

  async function connect(isScheduled: boolean = false): Promise<boolean> {
    try {
      if (nativePort) return true;
      if (isConnecting) return false;
      isConnecting = true;
      const attemptId = ++connectAttemptId;
      const generationAtStart = connectionGeneration;
      explicitDisconnect = false;
      reconnectScheduler.enable();
      reconnectScheduler.cancel();
      // Reset backoff counter for manual connect calls (permissions added,
      // SW startup, user action) so retries start from the shortest delay.
      // Don't reset for scheduler-driven retries — those must escalate.
      if (!isScheduled) reconnectScheduler.reset();

      try {
        if (!(await chrome.permissions.contains({ permissions: ['nativeMessaging'] })))
          return false;
        if (typeof chrome.runtime.connectNative !== 'function') return false;

        for (const hostName of NATIVE_HOST_NAMES) {
          try {
            const port = chrome.runtime.connectNative(hostName);
            const connected = await new Promise<boolean>((resolve) => {
              let settled = false;

              const onDisconnect = () => {
                if (settled) return;
                settled = true;
                handleDisconnectError(chrome.runtime.lastError?.message);
                resolve(false);
              };

              const onMessage = (message: NativeMessage) => {
                if (settled || message.type !== 'pong') return;
                settled = true;
                port.onDisconnect.removeListener(onDisconnect);
                port.onMessage.removeListener(onMessage);
                resolve(true);
              };

              port.onDisconnect.addListener(onDisconnect);
              port.onMessage.addListener(onMessage);

              try {
                port.postMessage({ type: 'ping' });
              } catch {
                if (!settled) {
                  settled = true;
                  resolve(false);
                }
                return;
              }

              setTimeout(() => {
                if (settled) return;
                settled = true;
                port.onDisconnect.removeListener(onDisconnect);
                port.onMessage.removeListener(onMessage);
                resolve(false);
              }, 10_000);
            });

            if (!connected) {
              port.disconnect();
              continue;
            }

            // Guard: if disconnect() was called while we were awaiting the
            // handshake, abort this connection — the user explicitly wanted
            // to disconnect and we must not silently reconnect behind them.
            if (
              explicitDisconnect ||
              generationAtStart !== connectionGeneration ||
              attemptId !== connectAttemptId ||
              nativePort
            ) {
              port.disconnect();
              continue;
            }

            nativePort = port;
            nativeHostInstalled = true;
            reconnectScheduler.reset();
            console.warn('[nativeHost] connected', { host: hostName });

            // Re-establish the MCP bridge after native host reconnection.
            // The bridge is independent of the native host, but reconnectMcp()
            // (called on disconnect) closes it. Reset retries to ensure a
            // fresh bridge connection attempt regardless of prior state.
            void connectBridge(true);

            const connectedPort = port;
            const connectedGeneration = generationAtStart;

            connectedPort.onMessage.addListener((message) => {
              if (nativePort !== connectedPort || connectedGeneration !== connectionGeneration) {
                return;
              }
              void handleNativeMessage(message);
            });

            disconnectHandler = () => {
              if (nativePort !== connectedPort || connectedGeneration !== connectionGeneration) {
                return;
              }
              const errorMessage = chrome.runtime.lastError?.message;
              console.warn('[nativeHost] disconnected', {
                error: errorMessage || 'unknown',
                willReconnect: !explicitDisconnect && nativeHostInstalled
              });
              nativePort = null;
              mcpConnected = false;
              resolveStatus();
              void setStorageValue(StorageKeys.MCP_CONNECTED, false);
              stopHeartbeat();
              handleDisconnectError(errorMessage);
              tabGroupManager.stopTabGroupChangeListener();
              reconnectMcp();
              reconnectScheduler.schedule();
            };
            connectedPort.onDisconnect.addListener(disconnectHandler);

            connectedPort.postMessage({ type: 'get_status' });
            const storedAnalyticsId = await getStoredSharedAnalyticsId();
            connectedPort.postMessage(
              storedAnalyticsId
                ? { type: 'sync_analytics_id', distinct_id: storedAnalyticsId }
                : { type: 'get_analytics_id' }
            );
            startHeartbeat();
            return true;
          } catch (err) {
            if (err instanceof Error) handleDisconnectError(err.message);
            // Try next host.
          }
        }

        return false;
      } catch (err) {
        if (err instanceof Error) handleDisconnectError(err.message);
        return false;
      } finally {
        if (attemptId === connectAttemptId) {
          isConnecting = false;
        }
        // If connect failed, schedule a retry. Use nativePort (not
        // nativeHostInstalled) as the success indicator — the probe loop
        // may have cleared nativeHostInstalled when the first host name
        // returned "not found" before trying the fallback host.
        if (!nativePort && !explicitDisconnect && generationAtStart === connectionGeneration) {
          reconnectScheduler.schedule();
        }
      }
    } catch {
      return false;
    }
  }

  async function reset(): Promise<NativeHostResetResult> {
    connectionGeneration++;
    connectAttemptId++;
    explicitDisconnect = false;
    reconnectScheduler.enable();
    reconnectScheduler.reset();
    isConnecting = false;
    await recycleNativePort({
      detachDebugger: true,
      reconnectBridge: true,
      scheduleReconnect: false
    });

    const connected = await connect(false);
    if (!connected) return { success: false, status: currentStatus() };

    return {
      success: true,
      reconnecting: true,
      status: {
        nativeHostInstalled: true,
        mcpConnected: false
      }
    };
  }

  async function disconnect(): Promise<boolean> {
    try {
      connectionGeneration++;
      connectAttemptId++;
      explicitDisconnect = true;
      reconnectScheduler.disable();
      stopHeartbeat();
      await chrome.permissions.remove({ permissions: ['nativeMessaging'] });
      nativePort?.disconnect();
      nativePort = null;
      isConnecting = false;
      nativeHostInstalled = false;
      mcpConnected = false;
      resolveStatus();
      return true;
    } catch {
      return false;
    }
  }

  async function getStatus(): Promise<NativeHostStatus> {
    const port = nativePort;
    if (port && nativeHostInstalled) {
      if (statusPromise) return statusPromise;
      const basePromise = new Promise<NativeHostStatus>((resolve) => {
        statusResolve = resolve;
        try {
          port.postMessage({ type: 'get_status' });
        } catch {
          statusResolve = null;
          resolve(currentStatus());
          return;
        }
        statusTimeout = setTimeout(() => {
          resolveStatus();
        }, 10_000);
      });
      const trackedPromise = basePromise.finally(() => {
        if (statusPromise === trackedPromise) statusPromise = null;
      });
      statusPromise = trackedPromise;
      return statusPromise;
    }

    return currentStatus();
  }

  function sendMcpNotification(method: string, params?: Record<string, unknown>): boolean {
    if (!nativePort) return false;
    try {
      nativePort.postMessage({
        type: 'notification',
        jsonrpc: '2.0',
        method,
        params: params || {}
      });
      return true;
    } catch {
      return false;
    }
  }

  return {
    connect,
    disconnect,
    reset,
    getStatus,
    sendMcpNotification,
    handleHeartbeatAlarm
  };
}
