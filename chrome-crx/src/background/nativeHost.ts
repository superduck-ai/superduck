import { setStorageValue, StorageKeys } from "../extensionServices";
import {
  reconnectMcp,
  tabGroupManager,
  createErrorResponse,
  executeTool,
} from "../mcpRuntime";

const NATIVE_HOST_NAMES = [
  "com.me.superduck_browser_extension",
  "com.me.superduck_code_browser_extension",
] as const;

type NativeMessage = { type: string; [key: string]: unknown };
type ToolRequestMessage = {
  method?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export interface NativeHostStatus {
  nativeHostInstalled: boolean;
  mcpConnected: boolean;
}

export interface NativeHostManager {
  connect: () => Promise<boolean>;
  disconnect: () => Promise<boolean>;
  getStatus: () => Promise<NativeHostStatus>;
  sendMcpNotification: (method: string, params?: Record<string, unknown>) => boolean;
}

export function createNativeHostManager(): NativeHostManager {
  let nativePort: chrome.runtime.Port | null = null;
  let isConnecting = false;
  let nativeHostInstalled = false;
  let mcpConnected = false;
  let statusResolve: ((value: NativeHostStatus) => void) | null = null;
  let statusTimeout: ReturnType<typeof setTimeout> | null = null;

  function handleDisconnectError(message?: string) {
    if (message?.includes("native messaging host not found")) {
      nativeHostInstalled = false;
    }
  }

  function parseOptionalInt(value: unknown): number | undefined {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  function buildErrorToolResponse(content: string | unknown[]) {
    const permissionDeniedSuffix =
      "IMPORTANT: The user has explicitly declined this action. Do not attempt to use other tools or workarounds. Instead, acknowledge the denial and ask the user how they would prefer to proceed.";

    const errorContent =
      typeof content === "string"
        ? content.includes("Permission denied by user")
          ? `${content} - ${permissionDeniedSuffix}`
          : content
        : content.map((item) => {
            if (
              typeof item === "object" &&
              item !== null &&
              "text" in item &&
              typeof item.text === "string" &&
              item.text.includes("Permission denied by user")
            ) {
              return { ...item, text: `${item.text} - ${permissionDeniedSuffix}` };
            }
            return item;
          });

    return { type: "tool_response", error: { content: errorContent } };
  }

  function sendToolResponse({ content, is_error }: { content: string | unknown[]; is_error?: boolean }) {
    if (!nativePort) return;
    if (!content || (typeof content !== "string" && !Array.isArray(content))) return;

    const response = is_error ? buildErrorToolResponse(content) : { type: "tool_response", result: { content } };

    nativePort.postMessage(response);
  }

  async function handleToolRequest(message: ToolRequestMessage) {
    try {
      const method = message.method;
      const params = message.params;

      if (method !== "execute_tool") {
        sendToolResponse({ content: `Unknown method: ${method}` });
        return;
      }

      if (!params || typeof params.tool !== "string") {
        sendToolResponse(createErrorResponse("No tool specified"));
        return;
      }

      const args = isRecord(params.args) ? params.args : {};
      const clientId = typeof params.client_id === "string" ? params.client_id : undefined;

      const result = await executeTool({
        toolName: params.tool,
        args,
        tabId: parseOptionalInt(args.tabId),
        tabGroupId: parseOptionalInt(args.tabGroupId),
        clientId,
        source: "native-messaging",
        permissionMode: "skip_all_permission_checks",
      });

      sendToolResponse({
        content: result.content ?? "",
        is_error: result.is_error,
      });
    } catch (err) {
      sendToolResponse(
        createErrorResponse(
          `Tool execution failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        ),
      );
    }
  }

  async function handleNativeMessage(message: NativeMessage) {
    switch (message.type) {
      case "tool_request":
        await handleToolRequest(message);
        break;

      case "status_response":
        if (statusResolve) {
          if (statusTimeout) {
            clearTimeout(statusTimeout);
            statusTimeout = null;
          }
          statusResolve({ nativeHostInstalled, mcpConnected });
          statusResolve = null;
        }
        break;

      case "mcp_connected":
        mcpConnected = true;
        void setStorageValue(StorageKeys.MCP_CONNECTED, true);
        await tabGroupManager.initialize();
        tabGroupManager.startTabGroupChangeListener();
        break;

      case "mcp_disconnected":
        mcpConnected = false;
        void setStorageValue(StorageKeys.MCP_CONNECTED, false);
        tabGroupManager.stopTabGroupChangeListener();
        break;
    }
  }

  async function connect(): Promise<boolean> {
    try {
      if (nativePort) return true;
      if (isConnecting) return false;
      isConnecting = true;

      try {
        if (!(await chrome.permissions.contains({ permissions: ["nativeMessaging"] }))) return false;
        if (typeof chrome.runtime.connectNative !== "function") return false;

        for (const hostName of NATIVE_HOST_NAMES) {
          try {
            const port = chrome.runtime.connectNative(hostName);
            const connected = await new Promise<boolean>((resolve) => {
              let settled = false;

              const onDisconnect = () => {
                if (settled) return;
                settled = true;
                chrome.runtime.lastError;
                resolve(false);
              };

              const onMessage = (message: NativeMessage) => {
                if (settled || message.type !== "pong") return;
                settled = true;
                port.onDisconnect.removeListener(onDisconnect);
                port.onMessage.removeListener(onMessage);
                resolve(true);
              };

              port.onDisconnect.addListener(onDisconnect);
              port.onMessage.addListener(onMessage);

              try {
                port.postMessage({ type: "ping" });
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

            nativePort = port;
            nativeHostInstalled = true;

            nativePort.onMessage.addListener((message) => {
              void handleNativeMessage(message);
            });

            nativePort.onDisconnect.addListener(() => {
              const errorMessage = chrome.runtime.lastError?.message;
              nativePort = null;
              mcpConnected = false;
              void setStorageValue(StorageKeys.MCP_CONNECTED, false);
              handleDisconnectError(errorMessage);
              reconnectMcp();
            });

            nativePort.postMessage({ type: "get_status" });
            return true;
          } catch {
            // Try next host.
          }
        }

        return false;
      } catch (err) {
        if (err instanceof Error) handleDisconnectError(err.message);
        return false;
      } finally {
        isConnecting = false;
      }
    } catch {
      return false;
    }
  }

  async function disconnect(): Promise<boolean> {
    try {
      await chrome.permissions.remove({ permissions: ["nativeMessaging"] });
      nativePort?.disconnect();
      nativePort = null;
      isConnecting = false;
      nativeHostInstalled = false;
      mcpConnected = false;
      return true;
    } catch {
      return false;
    }
  }

  async function getStatus(): Promise<NativeHostStatus> {
    const port = nativePort;
    if (port && nativeHostInstalled) {
      if (statusTimeout) clearTimeout(statusTimeout);

      return new Promise((resolve) => {
        statusResolve = resolve;
        port.postMessage({ type: "get_status" });
        statusTimeout = setTimeout(() => {
          statusResolve = null;
          resolve({ nativeHostInstalled, mcpConnected });
        }, 10_000);
      });
    }

    return { nativeHostInstalled, mcpConnected };
  }

  function sendMcpNotification(method: string, params?: Record<string, unknown>): boolean {
    if (!nativePort) return false;
    nativePort.postMessage({
      type: "notification",
      jsonrpc: "2.0",
      method,
      params: params || {},
    });
    return true;
  }

  return {
    connect,
    disconnect,
    getStatus,
    sendMcpNotification,
  };
}
