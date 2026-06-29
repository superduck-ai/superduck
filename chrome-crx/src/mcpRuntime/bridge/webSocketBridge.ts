import { isRecord } from '../../messageTypes';
import { trackEvent } from '../analytics';
import { handleProviderRuntimeMessage } from '../providerClient';
import { executeTool, setRequestBridgePermissionFn } from '../toolExecution/toolExecution';
import { isBridgeMessage, isStringArray, parseOptionalNumber } from '../core/utils';
import type {
  BridgeMessage,
  NavigatorWithUserAgentData,
  PermissionPromptRequest
} from '../core/types';

let bridgeWebSocket: WebSocket | null = null;
let bridgeConnecting: boolean = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let retryCount: number = 0;
let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
let cachedDeviceId: string | null = null;
let currentDeviceId: string | null = null;

const MAX_BRIDGE_RETRIES = 15;

async function getBridgeDisplayName(): Promise<string | undefined> {
  return (await chrome.storage.local.get('bridgeDisplayName')).bridgeDisplayName as
    | string
    | undefined;
}

const pendingToolCalls = new Map<string, { resolve: (value: boolean) => void }>();

function getPlatform(): string {
  try {
    const uaData = (navigator as NavigatorWithUserAgentData).userAgentData;
    return uaData?.platform ?? navigator.platform ?? 'Unknown';
  } catch {
    return navigator.platform ?? 'Unknown';
  }
}

async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const stored = await chrome.storage.local.get('bridgeDeviceId');
  if (stored.bridgeDeviceId) {
    cachedDeviceId = stored.bridgeDeviceId as string;
    return cachedDeviceId;
  }
  cachedDeviceId = crypto.randomUUID();
  await chrome.storage.local.set({ bridgeDeviceId: cachedDeviceId });
  return cachedDeviceId;
}

function startKeepalive(): void {
  stopKeepalive();
  keepaliveInterval = setInterval(() => {
    if (bridgeWebSocket?.readyState === WebSocket.OPEN) {
      bridgeWebSocket.send(JSON.stringify({ type: 'ping' }));
    }
  }, 20000);
}

function stopKeepalive(): void {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
}

async function getBridgeUrl(): Promise<string | undefined> {
  return undefined;
}

let lastPairingRequestId: string | undefined;

function clearAllPendingToolCalls(
  reason: 'bridge_disconnected' | 'manual_disconnect' = 'bridge_disconnected'
): void {
  for (const [, entry] of pendingToolCalls) {
    console.warn(
      `[clearAllPendingToolCalls] resolving pending request as false (reason: ${reason})`
    );
    entry.resolve(false);
  }
  pendingToolCalls.clear();
}

function sendBridgeMessage(message: Record<string, unknown>): void {
  if (bridgeWebSocket?.readyState === WebSocket.OPEN) {
    bridgeWebSocket.send(JSON.stringify(message));
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  retryCount++;
  if (retryCount > MAX_BRIDGE_RETRIES) {
    trackEvent('superduck.bridge.reconnect_exhausted', {
      attempts: retryCount - 1,
      max_retries: MAX_BRIDGE_RETRIES
    });
    return;
  }
  const delay = Math.min(2000 * Math.pow(1.5, retryCount - 1), 20000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectBridge(false);
  }, delay);
}

export async function connectBridge(resetRetries: boolean = true): Promise<boolean> {
  if (resetRetries) retryCount = 0;
  if (bridgeWebSocket?.readyState === WebSocket.OPEN || bridgeConnecting) return false;
  bridgeConnecting = true;
  const bridgeUrl = await getBridgeUrl();
  if (!bridgeUrl) {
    bridgeConnecting = false;
    return false;
  }
  try {
    const deviceId = await getDeviceId();
    currentDeviceId = deviceId;
    const displayName = await getBridgeDisplayName();
    const wsUrl = `${bridgeUrl}/chrome`;
    if (bridgeWebSocket) {
      bridgeWebSocket.onclose = null;
      bridgeWebSocket.close();
    }
    const ws = new WebSocket(wsUrl);
    bridgeWebSocket = ws;

    ws.onopen = () => {
      if (bridgeWebSocket !== ws) return;
      const connectMsg: Record<string, unknown> = {
        type: 'connect',
        client_type: 'chrome-extension',
        device_id: deviceId,
        os_platform: getPlatform(),
        ...(displayName && { display_name: displayName })
      };
      ws.send(JSON.stringify(connectMsg));
    };

    ws.onmessage = async (event) => {
      if (bridgeWebSocket !== ws) return;
      try {
        const message = JSON.parse(event.data) as unknown;
        if (!isBridgeMessage(message)) return;
        await handleBridgeMessage(message);
      } catch {
        // silently fail
      }
    };

    ws.onclose = (event) => {
      trackEvent('superduck.bridge.disconnected', {
        code: event.code,
        reason: event.reason,
        reconnect_attempt: retryCount
      });
      if (bridgeWebSocket === ws) {
        stopKeepalive();
        bridgeConnecting = false;
        bridgeWebSocket = null;
        clearAllPendingToolCalls('bridge_disconnected');
        scheduleReconnect();
      }
    };

    ws.onerror = (event) => {
      trackEvent('superduck.bridge.error', { error: String(event) });
      if (bridgeWebSocket === ws) {
        bridgeConnecting = false;
      }
    };

    return true;
  } catch {
    bridgeConnecting = false;
    scheduleReconnect();
    return false;
  }
}

async function handleBridgeMessage(message: BridgeMessage): Promise<void> {
  switch (message.type) {
    case 'paired':
      trackEvent('superduck.bridge.connected', { status: 'paired' });
      startKeepalive();
      bridgeConnecting = false;
      retryCount = 0;
      break;
    case 'waiting':
      trackEvent('superduck.bridge.connected', { status: 'waiting' });
      startKeepalive();
      bridgeConnecting = false;
      retryCount = 0;
      break;
    case 'ping':
      sendBridgeMessage({ type: 'pong' });
      break;
    case 'pong':
      break;
    case 'peer_connected':
      trackEvent('superduck.bridge.peer_connected');
      break;
    case 'peer_disconnected':
      trackEvent('superduck.bridge.peer_disconnected');
      break;
    case 'tool_call':
      await handleBridgeToolCall(message);
      break;
    case 'pairing_request':
      await handlePairingRequest(message);
      break;
    case 'permission_response':
      handlePermissionResponse(message);
      break;
    case 'error':
      bridgeConnecting = false;
      break;
  }
}

async function handleBridgeToolCall(message: BridgeMessage): Promise<void> {
  const targetDeviceId =
    typeof message.target_device_id === 'string' ? message.target_device_id : undefined;
  if (targetDeviceId && targetDeviceId !== currentDeviceId) return;
  const toolUseId = typeof message.tool_use_id === 'string' ? message.tool_use_id : undefined;
  const toolName = typeof message.tool === 'string' ? message.tool : undefined;
  const clientType = typeof message.client_type === 'string' ? message.client_type : 'desktop';
  const args = isRecord(message.args) ? message.args : {};
  const permissionMode =
    typeof message.permission_mode === 'string' ? message.permission_mode : undefined;
  const allowedDomains = isStringArray(message.allowed_domains)
    ? message.allowed_domains
    : undefined;
  const handlePermissionPrompts = true === message.handle_permission_prompts;
  if (!toolUseId || !toolName) return;
  const tabId = parseOptionalNumber(args.tabId);
  const tabGroupId = parseOptionalNumber(args.tabGroupId);
  if (tabId !== undefined) {
    try {
      await chrome.tabs.get(tabId);
    } catch {
      return;
    }
  }
  const trackData: Record<string, unknown> = {
    tool_name: toolName,
    client_type: clientType
  };
  try {
    const result = await executeTool({
      toolName,
      args,
      tabId,
      tabGroupId,
      clientId: clientType,
      source: 'bridge',
      permissionMode,
      allowedDomains,
      toolUseId,
      handlePermissionPrompts
    });
    trackEvent('superduck.bridge.tool_call', {
      ...trackData,
      success: !result.error
    });
    const bridgePayload: Record<string, unknown> = {
      ...result,
      type: 'tool_result',
      tool_use_id: toolUseId
    };
    if (typeof bridgePayload.error === 'string') {
      bridgePayload.error = {
        content: [{ type: 'text', text: bridgePayload.error }]
      };
    }
    sendBridgeMessage(bridgePayload);
  } catch (err) {
    trackEvent('superduck.bridge.tool_call', {
      ...trackData,
      success: false,
      error: err instanceof Error ? err.message : String(err)
    });
    sendBridgeMessage({
      type: 'tool_result',
      tool_use_id: toolUseId,
      error: {
        content: [
          {
            type: 'text',
            text: err instanceof Error ? err.message : String(err)
          }
        ]
      }
    });
  }
}

async function handlePairingRequest(message: BridgeMessage): Promise<void> {
  const requestId = typeof message.request_id === 'string' ? message.request_id : undefined;
  if (!requestId) return;
  if (requestId === lastPairingRequestId) return;
  lastPairingRequestId = requestId;
  const clientType = typeof message.client_type === 'string' ? message.client_type : 'desktop';
  const currentName = await getBridgeDisplayName();
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'show_pairing_prompt',
      request_id: requestId,
      client_type: clientType,
      current_name: currentName
    });
    if (response?.handled) return;
  } catch {
    // silently fail
  }
  const pairingUrl = chrome.runtime.getURL(
    `pairing.html?request_id=${encodeURIComponent(requestId)}&client_type=${encodeURIComponent(clientType)}&current_name=${encodeURIComponent(currentName || '')}`
  );
  chrome.tabs.create({ url: pairingUrl });
}

function handlePermissionResponse(message: BridgeMessage): void {
  const requestId = typeof message.request_id === 'string' ? message.request_id : undefined;
  if (!requestId) return;
  const pending = pendingToolCalls.get(requestId);
  if (!pending) return;
  pendingToolCalls.delete(requestId);
  pending.resolve(message.allowed === true);
}

export function reconnectMcp(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopKeepalive();
  retryCount = 0;
  bridgeConnecting = false;
  clearAllPendingToolCalls('manual_disconnect');
  if (bridgeWebSocket) {
    bridgeWebSocket.onclose = null;
    bridgeWebSocket.close();
    bridgeWebSocket = null;
  }
}

export function isBridgeConnected(): boolean {
  return bridgeWebSocket?.readyState === WebSocket.OPEN;
}

export function sendMcpNotificationViaBridge(
  method: string,
  params?: Record<string, unknown>
): boolean {
  if (!isBridgeConnected()) return false;
  sendBridgeMessage({ type: 'notification', method, params: params || {} });
  return true;
}

function handleBridgeRuntimeMessage(
  message: unknown,
  sendResponse: (response?: unknown) => void
): boolean {
  if (isRecord(message) && 'pairing_confirmed' === message.type) {
    const requestId = typeof message.request_id === 'string' ? message.request_id : undefined;
    const name = typeof message.name === 'string' ? message.name : '';
    if (!requestId) {
      sendResponse({ ok: false });
      return true;
    }
    (async function saveBridgeDisplayName(name: string) {
      await chrome.storage.local.set({ bridgeDisplayName: name });
    })(name);
    getDeviceId().then((deviceId) => {
      sendBridgeMessage({
        type: 'pairing_response',
        request_id: requestId,
        device_id: deviceId,
        name
      });
    });
    sendResponse({ ok: true });
    return true;
  }
  return false;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (handleProviderRuntimeMessage(message, sendResponse)) return false;
  handleBridgeRuntimeMessage(message, sendResponse);
  return false;
});

function requestBridgePermission(
  toolUseId: string,
  permissionData: PermissionPromptRequest
): Promise<boolean> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    pendingToolCalls.set(requestId, { resolve });
    sendBridgeMessage({
      type: 'permission_request',
      tool_use_id: toolUseId,
      request_id: requestId,
      tool_type: permissionData.tool,
      url: permissionData.url,
      action_data: permissionData.actionData
    });
  });
}

setRequestBridgePermissionFn(requestBridgePermission);
