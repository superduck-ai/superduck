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
});
