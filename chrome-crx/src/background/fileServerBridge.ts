/**
 * File server bridge — manages the localhost HTTP file server connection
 * between the CRX and the native host.
 *
 * The native host starts a 127.0.0.1-only HTTP server at startup and sends
 * a `file_server_ready` message with the URL and Bearer token. When a file
 * is uploaded via CLI/MCP (`superduck push-file`), the native host stores it
 * and sends a `file_ready` notification; consumers can subscribe via
 * `onFileReady` and fetch the file content via `fetchFileFromHost`.
 *
 * Extracted from nativeHost.ts to keep that file focused on port lifecycle
 * and tool routing. This module owns all file-server-related state.
 */

export interface FileReadyInfo {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface FileServerMessage {
  type: string;
  url?: string;
  token?: string;
  id?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
}

export interface FileServerBridge {
  /** Process an incoming native host message. Returns true if handled. */
  handleMessage: (message: FileServerMessage) => boolean;
  /** Fetch a stored file by ID from the localhost HTTP server. */
  fetchFileFromHost: (id: string) => Promise<Blob>;
  /** Register a callback for file_ready notifications. */
  onFileReady: (callback: (info: FileReadyInfo) => void) => void;
  /** Returns the current file server URL and auth token (empty if not ready). */
  getFileServerInfo: () => { url: string; token: string };
  /** Reset state (for tests / reconnect). */
  reset: () => void;
}

export function createFileServerBridge(): FileServerBridge {
  let url = '';
  let token = '';
  let readyCallback: ((info: FileReadyInfo) => void) | null = null;

  function handleMessage(message: FileServerMessage): boolean {
    switch (message.type) {
      case 'file_server_ready':
        if (typeof message.url === 'string' && typeof message.token === 'string') {
          url = message.url;
          token = message.token;
        }
        return true;

      case 'file_ready':
        if (readyCallback && message.id) {
          readyCallback({
            id: message.id,
            url: message.url ?? '',
            filename: message.filename ?? '',
            mimeType: message.mimeType ?? '',
            size: message.size ?? 0
          });
        }
        return true;

      default:
        return false;
    }
  }

  async function fetchFileFromHost(id: string): Promise<Blob> {
    if (!url || !token) {
      throw new Error('file server not ready — native host has not sent file_server_ready');
    }
    const resp = await fetch(`${url}/f/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!resp.ok) {
      throw new Error(`fetch file ${id}: ${resp.status} ${resp.statusText}`);
    }
    return resp.blob();
  }

  function onFileReady(callback: (info: FileReadyInfo) => void) {
    readyCallback = callback;
  }

  function getFileServerInfo() {
    return { url, token };
  }

  function reset() {
    url = '';
    token = '';
    readyCallback = null;
  }

  return {
    handleMessage,
    fetchFileFromHost,
    onFileReady,
    getFileServerInfo,
    reset
  };
}
