import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cdpDebugger: {
    isDebuggerAttached: vi.fn(async () => false),
    attachDebugger: vi.fn(async () => {})
  },
  tabGroupManager: {
    getTabForMcp: vi.fn(async () => ({
      tabId: 1,
      domain: 'example.com',
      url: 'https://example.com/path?session=secret'
    }))
  },
  startToolContext: vi.fn(async () => {}),
  cleanupAfterToolExecution: vi.fn(async () => {}),
  getOrCreateToolExecutor: vi.fn(),
  createErrorResponse: vi.fn((text: string) => ({
    content: [{ type: 'text', text }],
    is_error: true
  })),
  getSelectedModel: vi.fn(async () => 'claude-sonnet-4-6'),
  invalidateCachedClient: vi.fn(),
  trackEvent: vi.fn(),
  createBridgePermissionManager: vi.fn(() => null),
  showPermissionPrompt: vi.fn(),
  beginTool: vi.fn(),
  endTool: vi.fn(),
  mcpToolNames: [] as string[]
}));

vi.mock('../browserAutomation', () => ({ cdpDebugger: mocks.cdpDebugger }));
vi.mock('../tabState', () => ({ tabGroupManager: mocks.tabGroupManager }));
vi.mock('./toolContextState', () => ({
  startToolContext: mocks.startToolContext,
  cleanupAfterToolExecution: mocks.cleanupAfterToolExecution
}));
vi.mock('./toolExecutor', () => ({
  getOrCreateToolExecutor: mocks.getOrCreateToolExecutor,
  createErrorResponse: mocks.createErrorResponse
}));
vi.mock('../providerClient', () => ({
  getSelectedModel: mocks.getSelectedModel,
  invalidateCachedClient: mocks.invalidateCachedClient
}));
vi.mock('../analytics', () => ({ trackEvent: mocks.trackEvent }));
vi.mock('../domainPermissions', () => ({
  createBridgePermissionManager: mocks.createBridgePermissionManager
}));
vi.mock('./permissionPrompt', () => ({ showPermissionPrompt: mocks.showPermissionPrompt }));
vi.mock('../agentActivity', () => ({ beginTool: mocks.beginTool, endTool: mocks.endTool }));
vi.mock('../core/tools', () => ({ mcpToolNames: mocks.mcpToolNames }));

import { executeTool } from './toolExecution';
import { InMemoryDebugStore } from '../../debug/store';
import { startDebugSession, resetDebugRecorder } from '../../debug/recorder';
import type { DebugBaseEvent } from '../../debug/schema';

function successExecutor() {
  return {
    context: {},
    processToolResults: vi.fn(async () => [
      { type: 'tool_result', tool_use_id: 'r', content: 'ok' }
    ])
  };
}

function toolRuntimeEvents(events: DebugBaseEvent[]): DebugBaseEvent[] {
  return events.filter((e) => e.domain === 'tool-runtime');
}

describe('executeTool debug instrumentation', () => {
  let store: InMemoryDebugStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    store = new InMemoryDebugStore();
    mocks.cdpDebugger.isDebuggerAttached.mockResolvedValue(false);
    mocks.cdpDebugger.attachDebugger.mockResolvedValue(undefined);
    mocks.tabGroupManager.getTabForMcp.mockResolvedValue({
      tabId: 1,
      domain: 'example.com',
      url: 'https://example.com/path?session=secret'
    });
    mocks.getOrCreateToolExecutor.mockResolvedValue(successExecutor());
    mocks.mcpToolNames.length = 0;
    await startDebugSession({ store, extensionVersion: '0.1.0' });
  });

  afterEach(() => {
    resetDebugRecorder();
  });

  it('emits the full tool-runtime event sequence on success', async () => {
    await executeTool({
      toolName: 'computer_screenshot',
      args: { action: 'screenshot' },
      source: 'sidepanel',
      permissionMode: 'skip_all_permission_checks'
    });

    const events = toolRuntimeEvents(await store.getEvents());
    const names = events.map((e) => e.event);
    expect(names).toEqual([
      'tool.request.received',
      'tool.tab.resolve.start',
      'tool.tab.resolve.end',
      'tool.debugger.attach.start',
      'tool.debugger.attach.end',
      'tool.executor.start',
      'tool.execute.end',
      'tool.response.sent'
    ]);
  });

  it('tool.request.received carries redacted input fields and source', async () => {
    await executeTool({
      toolName: 'read_page',
      args: { filter: 'text', depth: 3, apiKey: 'sk-secret' },
      source: 'native-messaging',
      permissionMode: 'skip_all_permission_checks'
    });

    const events = toolRuntimeEvents(await store.getEvents());
    const received = events.find((e) => e.event === 'tool.request.received')!;
    expect(received.data?.toolName).toBe('read_page');
    expect(received.data?.source).toBe('native-messaging');
    expect(received.data?.inputFields).toMatchObject({ filter: 'text', depth: 3 });
    expect(received.data?.inputFields).not.toHaveProperty('apiKey');
    expect(received.ids.requestId).toBeTruthy();
  });

  it('tab.resolve.end redacts the URL query', async () => {
    await executeTool({
      toolName: 'computer_screenshot',
      args: {},
      source: 'sidepanel'
    });

    const events = toolRuntimeEvents(await store.getEvents());
    const resolveEnd = events.find((e) => e.event === 'tool.tab.resolve.end')!;
    expect(resolveEnd.data?.urlOrigin).toBe('https://example.com/path?[redacted-query]');
    expect(resolveEnd.data?.success).toBe(true);
    expect(resolveEnd.ids.tabId).toBe(1);
  });

  it('emits tool.tab.resolve.end error when no tabs available', async () => {
    mocks.tabGroupManager.getTabForMcp.mockRejectedValue(new Error('no tabs'));

    await executeTool({
      toolName: 'computer_screenshot',
      args: {},
      source: 'sidepanel'
    });

    const events = toolRuntimeEvents(await store.getEvents());
    const resolveEnd = events.find((e) => e.event === 'tool.tab.resolve.end');
    expect(resolveEnd).toBeDefined();
    expect(resolveEnd?.level).toBe('error');
    expect(resolveEnd?.error?.message).toBe('no tabs');
    expect(events.find((e) => e.event === 'tool.executor.start')).toBeUndefined();
  });

  it('emits tool.debugger.attach.end error on attach failure (non-internal page)', async () => {
    mocks.cdpDebugger.attachDebugger.mockRejectedValue(new Error('user declined banner'));

    await executeTool({
      toolName: 'computer_screenshot',
      args: {},
      source: 'sidepanel'
    });

    const events = toolRuntimeEvents(await store.getEvents());
    const attachEnd = events.find((e) => e.event === 'tool.debugger.attach.end');
    expect(attachEnd).toBeDefined();
    expect(attachEnd?.level).toBe('error');
    expect(attachEnd?.data?.success).toBe(false);
    expect(attachEnd?.data?.isInternalPage).toBe(false);
    expect(events.find((e) => e.event === 'tool.executor.start')).toBeUndefined();
  });

  it('emits tool.execute.end error when executor throws', async () => {
    mocks.getOrCreateToolExecutor.mockResolvedValue({
      context: {},
      processToolResults: vi.fn(async () => {
        throw new Error('runtime blew up');
      })
    });

    await executeTool({
      toolName: 'computer_screenshot',
      args: {},
      source: 'sidepanel'
    });

    const events = toolRuntimeEvents(await store.getEvents());
    const execEnd = events.find((e) => e.event === 'tool.execute.end');
    expect(execEnd).toBeDefined();
    expect(execEnd?.level).toBe('error');
    expect(execEnd?.data?.success).toBe(false);
    expect(execEnd?.data?.resultType).toBe('execution_error');
    // response.sent still fires after the error path
    expect(events.find((e) => e.event === 'tool.response.sent')).toBeDefined();
  });

  it('does not record when debug is disabled', async () => {
    resetDebugRecorder();
    await executeTool({
      toolName: 'computer_screenshot',
      args: {},
      source: 'sidepanel'
    });
    const events = toolRuntimeEvents(await store.getEvents());
    expect(events).toHaveLength(0);
  });

  it('skips tab resolve for mcp tools without tabId', async () => {
    mocks.mcpToolNames.push('mcp_internal_tool');
    mocks.getOrCreateToolExecutor.mockResolvedValue(successExecutor());

    await executeTool({
      toolName: 'mcp_internal_tool',
      args: {},
      source: 'sidepanel'
    });

    const events = toolRuntimeEvents(await store.getEvents());
    expect(events.find((e) => e.event === 'tool.tab.resolve.start')).toBeUndefined();
    expect(events.find((e) => e.event === 'tool.request.received')).toBeDefined();
  });
});
