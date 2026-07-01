import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mcpRuntimeMocks = vi.hoisted(() => ({
  reconnectMcp: vi.fn(),
  connectBridge: vi.fn(),
  createErrorResponse: vi.fn((text: string) => ({
    content: [{ type: 'text', text }],
    is_error: true
  })),
  executeTool: vi.fn(),
  tabGroupManager: {
    initialize: vi.fn(),
    startTabGroupChangeListener: vi.fn(),
    stopTabGroupChangeListener: vi.fn()
  }
}));

vi.mock('../mcpRuntime', () => mcpRuntimeMocks);

vi.mock('../extensionServices', () => ({
  getStoredSharedAnalyticsId: vi.fn(async () => undefined),
  setSharedAnalyticsId: vi.fn(async () => undefined),
  setStorageValue: vi.fn(async () => undefined),
  StorageKeys: {
    MCP_CONNECTED: 'mcpConnected'
  }
}));

import { createNativeHostManager } from './nativeHost';

type Listener<T extends (...args: never[]) => void> = T;

function createEvent<T extends (...args: never[]) => void>() {
  const listeners = new Set<Listener<T>>();
  return {
    addListener: vi.fn((listener: Listener<T>) => {
      listeners.add(listener);
    }),
    removeListener: vi.fn((listener: Listener<T>) => {
      listeners.delete(listener);
    }),
    emit: (...args: Parameters<T>) => {
      for (const listener of [...listeners]) listener(...args);
    }
  };
}

describe('createNativeHostManager', () => {
  let messageEvent: ReturnType<typeof createEvent<(message: Record<string, unknown>) => void>>;
  let disconnectEvent: ReturnType<typeof createEvent<() => void>>;
  let postMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    messageEvent = createEvent<(message: Record<string, unknown>) => void>();
    disconnectEvent = createEvent<() => void>();
    postMessage = vi.fn((message: Record<string, unknown>) => {
      if (message.type === 'ping') queueMicrotask(() => messageEvent.emit({ type: 'pong' }));
    });

    vi.stubGlobal('chrome', {
      permissions: {
        contains: vi.fn(async () => true),
        remove: vi.fn(async () => true)
      },
      runtime: {
        lastError: undefined,
        connectNative: vi.fn(() => ({
          postMessage,
          disconnect: vi.fn(),
          onMessage: messageEvent,
          onDisconnect: disconnectEvent
        }))
      },
      alarms: {
        create: vi.fn(),
        clear: vi.fn()
      },
      debugger: {
        getTargets: vi.fn(async () => [])
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function connectManager() {
    const manager = createNativeHostManager();
    const connected = manager.connect();
    await Promise.resolve();
    await expect(connected).resolves.toBe(true);
    postMessage.mockClear();
    return manager;
  }

  function createNativePort({
    autoPong = true,
    disconnectOnPing = false
  }: { autoPong?: boolean; disconnectOnPing?: boolean } = {}) {
    const portMessageEvent = createEvent<(message: Record<string, unknown>) => void>();
    const portDisconnectEvent = createEvent<() => void>();
    const portPostMessage = vi.fn((message: Record<string, unknown>) => {
      if (disconnectOnPing && message.type === 'ping') {
        queueMicrotask(() => {
          Object.assign(chrome.runtime, {
            lastError: { message: 'Specified native messaging host not found.' }
          });
          portDisconnectEvent.emit();
        });
        return;
      }
      if (autoPong && message.type === 'ping') {
        queueMicrotask(() => portMessageEvent.emit({ type: 'pong' }));
      }
    });
    const portDisconnect = vi.fn();

    return {
      postMessage: portPostMessage,
      disconnect: portDisconnect,
      onMessage: portMessageEvent,
      onDisconnect: portDisconnectEvent
    };
  }

  async function flushMicrotasks(times = 3) {
    for (let index = 0; index < times; index++) {
      await Promise.resolve();
    }
  }

  function toolResponses() {
    return postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === 'tool_response');
  }

  it('returns a tool error when native-messaging execution hangs', async () => {
    await connectManager();
    mcpRuntimeMocks.executeTool.mockReturnValue(new Promise(() => undefined));

    messageEvent.emit({
      type: 'tool_request',
      method: 'execute_tool',
      params: { tool: 'superduck_list_tabs', args: {}, client_id: 'superduck-cli' }
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(35_000);

    expect(toolResponses()).toEqual([
      {
        type: 'tool_response',
        error: {
          content: [
            {
              type: 'text',
              text: 'Tool execution timed out after 35s: superduck_list_tabs'
            }
          ]
        }
      }
    ]);
  });

  it('does not send a second response when a timed-out tool resolves later', async () => {
    await connectManager();
    let resolveTool!: (value: { content: string }) => void;
    mcpRuntimeMocks.executeTool.mockReturnValue(
      new Promise((resolve) => {
        resolveTool = resolve;
      })
    );

    messageEvent.emit({
      type: 'tool_request',
      method: 'execute_tool',
      params: { tool: 'superduck_list_tabs', args: {}, client_id: 'superduck-cli' }
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(35_000);
    resolveTool({ content: 'late success' });
    await Promise.resolve();

    expect(toolResponses()).toHaveLength(1);
    expect(toolResponses()[0].error.content[0].text).toBe(
      'Tool execution timed out after 35s: superduck_list_tabs'
    );
  });

  it('extends native-messaging tool timeouts for browser_batch action count', async () => {
    await connectManager();
    mcpRuntimeMocks.executeTool.mockReturnValue(new Promise(() => undefined));

    messageEvent.emit({
      type: 'tool_request',
      method: 'execute_tool',
      params: {
        tool: 'browser_batch',
        args: {
          actions: [
            { tool: 'computer', input: { action: 'wait', duration: 14 } },
            { tool: 'computer', input: { action: 'wait', duration: 14 } },
            { tool: 'computer', input: { action: 'wait', duration: 14 } }
          ]
        },
        client_id: 'superduck-cli'
      }
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(35_000);

    expect(toolResponses()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(45_000);

    expect(toolResponses()[0].error.content[0].text).toBe(
      'Tool execution timed out after 80s: browser_batch'
    );
  });

  it('allows valid 30-second wait tools to complete before the timeout', async () => {
    await connectManager();
    mcpRuntimeMocks.executeTool.mockReturnValue(
      new Promise((resolve) => {
        setTimeout(() => resolve({ content: 'Waited for 30 seconds' }), 30_000);
      })
    );

    messageEvent.emit({
      type: 'tool_request',
      method: 'execute_tool',
      params: {
        tool: 'computer',
        args: { action: 'wait', duration: 30 },
        client_id: 'superduck-cli'
      }
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(toolResponses()).toEqual([
      {
        type: 'tool_response',
        result: { content: 'Waited for 30 seconds' }
      }
    ]);
  });

  it('shares one in-flight native-host status request across concurrent callers', async () => {
    const manager = await connectManager();

    const first = manager.getStatus();
    const second = manager.getStatus();
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: 'get_status' });

    messageEvent.emit({ type: 'status_response' });

    await expect(first).resolves.toEqual({ nativeHostInstalled: true, mcpConnected: false });
    await expect(second).resolves.toEqual({ nativeHostInstalled: true, mcpConnected: false });
  });

  it('uses status_response payload for native-host MCP connection state', async () => {
    const manager = await connectManager();

    const status = manager.getStatus();
    messageEvent.emit({ type: 'status_response', mcpConnected: true });

    await expect(status).resolves.toEqual({ nativeHostInstalled: true, mcpConnected: true });
    expect(mcpRuntimeMocks.tabGroupManager.initialize).toHaveBeenCalled();
    expect(mcpRuntimeMocks.tabGroupManager.startTabGroupChangeListener).toHaveBeenCalled();
  });

  it('returns cached status when status probing a stale native port throws', async () => {
    const manager = await connectManager();
    postMessage.mockImplementationOnce(() => {
      throw new Error('disconnected');
    });

    await expect(manager.getStatus()).resolves.toEqual({
      nativeHostInstalled: true,
      mcpConnected: false
    });
  });

  it('returns false when notification posting fails on a stale native port', async () => {
    const manager = await connectManager();
    postMessage.mockImplementationOnce(() => {
      throw new Error('disconnected');
    });

    expect(manager.sendMcpNotification('notifications/test')).toBe(false);
  });

  it('reports connecting while a native-host handshake is still in progress', async () => {
    const pendingPort = createNativePort({ autoPong: false });
    vi.mocked(chrome.runtime.connectNative)
      .mockReset()
      .mockReturnValue(pendingPort as unknown as chrome.runtime.Port);

    const manager = createNativeHostManager();
    const connect = manager.connect();
    await flushMicrotasks();

    await expect(manager.getStatus()).resolves.toEqual({
      nativeHostInstalled: false,
      mcpConnected: false,
      connecting: true
    });

    await vi.advanceTimersByTimeAsync(20_000);
    await expect(connect).resolves.toBe(false);
  });

  it('resets the native-host port without removing nativeMessaging permission', async () => {
    const firstPort = createNativePort();
    const secondPort = createNativePort();
    vi.mocked(chrome.runtime.connectNative)
      .mockReset()
      .mockReturnValueOnce(firstPort as unknown as chrome.runtime.Port)
      .mockReturnValueOnce(secondPort as unknown as chrome.runtime.Port);

    const manager = createNativeHostManager();
    await expect(manager.connect()).resolves.toBe(true);

    const reset = manager.reset();
    await flushMicrotasks();

    await expect(reset).resolves.toEqual({
      success: true,
      reconnecting: true,
      status: {
        nativeHostInstalled: true,
        mcpConnected: false
      }
    });
    expect(chrome.permissions.remove).not.toHaveBeenCalled();
    expect(firstPort.disconnect).toHaveBeenCalledTimes(1);
    expect(chrome.runtime.connectNative).toHaveBeenCalledTimes(2);
    expect(mcpRuntimeMocks.reconnectMcp).toHaveBeenCalledTimes(1);
  });

  it('marks the native host as uninstalled when reset cannot find either host name', async () => {
    const healthyPort = createNativePort();
    const missingPrimaryPort = createNativePort({ disconnectOnPing: true });
    const missingFallbackPort = createNativePort({ disconnectOnPing: true });
    vi.mocked(chrome.runtime.connectNative)
      .mockReset()
      .mockReturnValueOnce(healthyPort as unknown as chrome.runtime.Port)
      .mockReturnValueOnce(missingPrimaryPort as unknown as chrome.runtime.Port)
      .mockReturnValueOnce(missingFallbackPort as unknown as chrome.runtime.Port);

    const manager = createNativeHostManager();
    await expect(manager.connect()).resolves.toBe(true);

    const reset = manager.reset();
    await flushMicrotasks();

    await expect(reset).resolves.toEqual({
      success: false,
      status: {
        nativeHostInstalled: false,
        mcpConnected: false
      }
    });
  });

  it('ignores old port disconnect events after reset installs a new port', async () => {
    const firstPort = createNativePort();
    const secondPort = createNativePort();
    vi.mocked(chrome.runtime.connectNative)
      .mockReset()
      .mockReturnValueOnce(firstPort as unknown as chrome.runtime.Port)
      .mockReturnValueOnce(secondPort as unknown as chrome.runtime.Port);

    const manager = createNativeHostManager();
    await expect(manager.connect()).resolves.toBe(true);

    const reset = manager.reset();
    await flushMicrotasks();
    await expect(reset).resolves.toEqual({
      success: true,
      reconnecting: true,
      status: {
        nativeHostInstalled: true,
        mcpConnected: false
      }
    });

    mcpRuntimeMocks.reconnectMcp.mockClear();
    firstPort.onDisconnect.emit();

    expect(mcpRuntimeMocks.reconnectMcp).not.toHaveBeenCalled();
    expect(manager.sendMcpNotification('notifications/test')).toBe(true);
    expect(secondPort.postMessage).toHaveBeenLastCalledWith({
      type: 'notification',
      jsonrpc: '2.0',
      method: 'notifications/test',
      params: {}
    });
  });

  it('stores file server URL and token from file_server_ready message', async () => {
    const manager = await connectManager();

    expect(manager.getFileServerInfo()).toEqual({ url: '', token: '' });

    messageEvent.emit({
      type: 'file_server_ready',
      url: 'http://127.0.0.1:54321',
      token: 'secret-token-abc'
    });

    expect(manager.getFileServerInfo()).toEqual({
      url: 'http://127.0.0.1:54321',
      token: 'secret-token-abc'
    });
  });

  it('calls onFileReady callback when file_ready message arrives', async () => {
    const manager = await connectManager();

    const received: unknown[] = [];
    manager.onFileReady((info) => received.push(info));

    messageEvent.emit({
      type: 'file_ready',
      id: 'file-123',
      url: 'http://127.0.0.1:54321/f/file-123',
      filename: 'report.md',
      mimeType: 'text/markdown',
      size: 1024
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      id: 'file-123',
      url: 'http://127.0.0.1:54321/f/file-123',
      filename: 'report.md',
      mimeType: 'text/markdown',
      size: 1024
    });
  });

  it('fetchFileFromHost throws when file server is not ready', async () => {
    const manager = await connectManager();
    await expect(manager.fetchFileFromHost('test-id')).rejects.toThrow('file server not ready');
  });

  it('fetchFileFromHost fetches with Bearer auth and returns blob', async () => {
    const manager = await connectManager();

    messageEvent.emit({
      type: 'file_server_ready',
      url: 'http://127.0.0.1:54321',
      token: 'secret-token-abc'
    });

    const mockBlob = new Blob(['file content'], { type: 'text/plain' });
    const fetchMock = vi.fn(
      async () => new Response(mockBlob, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const blob = await manager.fetchFileFromHost('file-123');

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:54321/f/file-123', {
      headers: { Authorization: 'Bearer secret-token-abc' }
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(mockBlob.size);
  });

  it('fetchFileFromHost throws on HTTP error status', async () => {
    const manager = await connectManager();

    messageEvent.emit({
      type: 'file_server_ready',
      url: 'http://127.0.0.1:54321',
      token: 'secret-token-abc'
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404, statusText: 'Not Found' }))
    );

    await expect(manager.fetchFileFromHost('missing-id')).rejects.toThrow(
      'fetch file missing-id: 404'
    );
  });
});
