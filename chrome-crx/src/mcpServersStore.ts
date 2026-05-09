import { create } from "zustand";

// =============================================================================
// Blob / Data URL Utilities
// =============================================================================

/**
 * Convert a data URL (e.g. "data:image/png;base64,…") to a Blob.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",");
  const mimeType = header.match(/:(.*?);/)?.[1] || "image/png";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * Convert a Blob to a data URL string via FileReader.
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Extract the base64 payload from a data URL, stripping the "data:…;base64," prefix.
 */
export function extractBase64FromDataUrl(dataUrl: string): string {
  return (dataUrl && dataUrl.includes(",") && dataUrl.split(",")[1]) || "";
}

/**
 * Convert a raw base64 string to a Blob with the given MIME type.
 */
export function base64ToBlob(
  base64: string,
  mimeType: string = "image/png",
): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

// =============================================================================
// Session ID Generator
// =============================================================================

/**
 * Generate a short session identifier like "ss_1234abcde".
 */
export function generateSessionId(): string {
  return `ss_${Date.now().toString().slice(-4)}${Math.random().toString(36).substring(2, 7)}`;
}

// =============================================================================
// MCP Servers Store (Zustand)
// =============================================================================

export interface McpServer {
  uuid: string;
  connected: boolean;
  [key: string]: any;
}

export interface McpTool {
  [key: string]: any;
}

export interface McpServersState {
  remoteServers: Record<string, McpServer>;
  remoteTools: Record<string, McpTool[]>;
  addServers: (servers: McpServer[]) => void;
  addTools: (serverId: string, tools: McpTool[]) => void;
  updateServerConnection: (serverId: string, connected: boolean) => void;
  getServerByUuid: (uuid: string) => McpServer | undefined;
}

export const mcpServersStore = create<McpServersState>((set, get) => ({
  remoteServers: {},
  remoteTools: {},

  addServers: (servers) =>
    set((state) => ({
      remoteServers: servers.reduce(
        (acc, server) => ({ ...acc, [server.uuid]: server }),
        state.remoteServers,
      ),
    })),

  addTools: (serverId, tools) =>
    set((state) => ({
      remoteTools: { ...state.remoteTools, [serverId]: tools },
    })),

  updateServerConnection: (serverId, connected) =>
    set((state) => {
      const server = state.remoteServers[serverId];
      if (!server) return state;
      return {
        remoteServers: {
          ...state.remoteServers,
          [serverId]: { ...server, connected },
        },
      };
    }),

  getServerByUuid: (uuid) => get().remoteServers[uuid],
}));

// =============================================================================
// Re-exports
// =============================================================================

export { create } from "zustand";
export { default as MessagesClient } from "@anthropic-ai/sdk";
