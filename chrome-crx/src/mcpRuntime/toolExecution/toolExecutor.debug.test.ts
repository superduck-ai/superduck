import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InMemoryDebugStore } from '@/debug/store';

const toolsMock = vi.hoisted(() => ({
  allTools: [] as Array<{ name: string; execute: ReturnType<typeof vi.fn> }>,
  mcpToolNames: [] as string[]
}));

const utilsMock = vi.hoisted(() => ({
  coerceToolInput: vi.fn((_name: string, input: unknown) => input),
  validateInput: vi.fn(() => ({ valid: true as boolean, errors: [] as string[] })),
  isPermissionPromptRequest: vi.fn(() => false)
}));

vi.mock('../core/tools', () => ({
  allTools: toolsMock.allTools,
  mcpToolNames: toolsMock.mcpToolNames
}));

vi.mock('../core/utils', () => utilsMock);

vi.mock('../analytics', () => ({ trackEvent: vi.fn() }));

vi.mock('./toolRecording', () => ({ recordToolAction: vi.fn(async () => {}) }));

vi.mock('../../observability', () => ({
  withTracing: vi.fn(
    async <T>(_name: string, fn: (span: { setAttribute: () => void }) => Promise<T>) =>
      fn({ setAttribute: () => {} })
  )
}));

vi.mock('../providerClient', () => ({
  getSelectedModel: vi.fn(async () => 'claude-sonnet-4-6'),
  refreshMessagesClient: vi.fn(async () => undefined),
  dispatchMessagesClient: vi.fn()
}));

vi.mock('../utils/imageCompressor', () => ({
  compressBase64Image: vi.fn(async (b64: string) => ({ data: b64, mediaType: 'image/png' }))
}));

vi.mock('../domainPermissions', () => ({
  createBridgePermissionManager: vi.fn(() => null)
}));

vi.mock('./permissionPrompt', () => ({ showPermissionPrompt: vi.fn() }));

describe('ToolExecutor debug instrumentation', () => {
  let store: InMemoryDebugStore;

  beforeEach(async () => {
    vi.resetModules();
    toolsMock.allTools.length = 0;
    toolsMock.mcpToolNames.length = 0;
    utilsMock.validateInput.mockReturnValue({ valid: true, errors: [] });
    utilsMock.coerceToolInput.mockImplementation((_n: string, input: unknown) => input);
    utilsMock.isPermissionPromptRequest.mockReturnValue(false);
    vi.stubGlobal('chrome', {
      tabs: { onRemoved: { addListener: vi.fn() } }
    });
    const { InMemoryDebugStore } = await import('@/debug/store');
    const { startDebugSession } = await import('@/debug/recorder');
    store = new InMemoryDebugStore();
    await startDebugSession({ store });
  });

  afterEach(async () => {
    const { resetDebugRecorder } = await import('@/debug/recorder');
    resetDebugRecorder();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  async function toolRuntimeEvents() {
    const evts = await store.getEvents();
    return evts.filter((e) => e.domain === 'tool-runtime');
  }

  it('records tool.execute.start/end on successful tool execution', async () => {
    toolsMock.allTools.push({
      name: 'fake_tool',
      execute: vi.fn(async () => ({ output: 'ok' }))
    });
    const { ToolExecutor } = await import('./toolExecutor');
    const executor = new ToolExecutor({
      tabId: 10,
      tabGroupId: 1,
      model: 'claude-sonnet-4-6',
      sessionId: 's1',
      permissionManager: { checkPermission: vi.fn() } as never
    });
    const result = await executor.handleToolCall('fake_tool', { x: 1 }, 'tu-1');
    expect(result.output).toBe('ok');

    const events = await toolRuntimeEvents();
    const names = events.map((e) => e.event);
    expect(names).toContain('tool.execute.start');
    expect(names).toContain('tool.execute.end');
    const end = events.find((e) => e.event === 'tool.execute.end')!;
    expect(end.data?.success).toBe(true);
    expect(end.data?.resultType).toBe('success');
  });

  it('records tool.input.validation_failed on invalid input', async () => {
    toolsMock.allTools.push({ name: 'fake_tool', execute: vi.fn() });
    utilsMock.validateInput.mockReturnValue({ valid: false, errors: ['x must be > 0'] });
    const { ToolExecutor } = await import('./toolExecutor');
    const executor = new ToolExecutor({
      tabId: 10,
      model: 'm',
      sessionId: 's1',
      permissionManager: { checkPermission: vi.fn() } as never
    });
    const result = await executor.handleToolCall('fake_tool', { x: -1 }, 'tu-2');
    expect(result.is_error).toBe(true);

    const events = await toolRuntimeEvents();
    const vf = events.find((e) => e.event === 'tool.input.validation_failed');
    expect(vf).toBeDefined();
    expect(vf?.data?.errors).toContain('x must be > 0');
    // execute.start must NOT fire when validation fails
    expect(events.find((e) => e.event === 'tool.execute.start')).toBeUndefined();
  });

  it('records tool.permission.required with handlerExists when permission needed', async () => {
    toolsMock.allTools.push({
      name: 'navigate',
      execute: vi.fn(async () => ({ type: 'permission_required', url: 'https://x.test' }))
    });
    utilsMock.isPermissionPromptRequest.mockReturnValue(true);
    const { ToolExecutor } = await import('./toolExecutor');
    const executor = new ToolExecutor({
      tabId: 10,
      model: 'm',
      sessionId: 's1',
      permissionManager: { checkPermission: vi.fn() } as never
    });
    await executor.processToolResults(
      [{ type: 'tool_use', id: 'tu-3', name: 'navigate', input: {} }],
      { onPermissionRequired: vi.fn(async () => false) }
    );

    const events = await toolRuntimeEvents();
    const perm = events.find((e) => e.event === 'tool.permission.required');
    expect(perm).toBeDefined();
    expect(perm?.data?.handlerExists).toBe(true);
  });

  it('records tool.permission.required with handlerExists=false when no handler', async () => {
    toolsMock.allTools.push({
      name: 'navigate',
      execute: vi.fn(async () => ({ type: 'permission_required', url: 'https://x.test' }))
    });
    utilsMock.isPermissionPromptRequest.mockReturnValue(true);
    const { ToolExecutor } = await import('./toolExecutor');
    const executor = new ToolExecutor({
      tabId: 10,
      model: 'm',
      sessionId: 's1',
      permissionManager: { checkPermission: vi.fn() } as never
    });
    await executor.processToolResults(
      [{ type: 'tool_use', id: 'tu-4', name: 'navigate', input: {} }],
      {}
    );

    const events = await toolRuntimeEvents();
    const perm = events.find((e) => e.event === 'tool.permission.required');
    expect(perm).toBeDefined();
    expect(perm?.data?.handlerExists).toBe(false);
  });

  it('does not record tool.execute events when debug is disabled', async () => {
    toolsMock.allTools.push({
      name: 'fake_tool',
      execute: vi.fn(async () => ({ output: 'ok' }))
    });
    const { resetDebugRecorder } = await import('@/debug/recorder');
    resetDebugRecorder();
    const { ToolExecutor } = await import('./toolExecutor');
    const executor = new ToolExecutor({
      tabId: 10,
      model: 'm',
      sessionId: 's1',
      permissionManager: { checkPermission: vi.fn() } as never
    });
    await executor.handleToolCall('fake_tool', {}, 'tu-5');
    const events = await toolRuntimeEvents();
    expect(events).toHaveLength(0);
  });
});
