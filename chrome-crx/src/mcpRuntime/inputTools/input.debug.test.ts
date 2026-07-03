import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InMemoryDebugStore } from '@/debug/store';

const cdpMock = vi.hoisted(() => ({
  screenshot: vi.fn(),
  clearWindowOpenEvents: vi.fn(),
  enablePageEvents: vi.fn()
}));

const tabStateMock = vi.hoisted(() => ({
  getEffectiveTabId: vi.fn(),
  getValidTabsWithMetadata: vi.fn(),
  withPreservedActiveTab: vi.fn(),
  rememberChildTabNavigationPolicy: vi.fn()
}));

const actionsMock = vi.hoisted(() => ({
  executeScreenshot: vi.fn()
}));

vi.mock('../tabState', () => ({
  tabGroupManager: tabStateMock
}));

vi.mock('../cdp', () => ({
  cdpDebugger: cdpMock
}));

vi.mock('../screenshot/annotatedScreenshot', () => ({
  captureAnnotatedScreenshot: vi.fn()
}));

vi.mock('./computerActions', () => actionsMock);

vi.mock('../navigationIsolation', () => ({
  createPolicyCheckedChildTab: vi.fn(),
  filterPolicyAllowedTabs: vi.fn(),
  moveSearchNavigationToNewTab: vi.fn()
}));

vi.mock('../extensionServices', () => ({
  PermissionActionType: { READ_PAGE_CONTENT: 'read_page_content' }
}));

describe('computerTool debug instrumentation', () => {
  let store: InMemoryDebugStore;

  beforeEach(async () => {
    vi.resetModules();
    cdpMock.screenshot.mockReset();
    actionsMock.executeScreenshot.mockReset();
    tabStateMock.getEffectiveTabId.mockReset();
    tabStateMock.getValidTabsWithMetadata.mockReset();
    tabStateMock.withPreservedActiveTab.mockReset();

    tabStateMock.getEffectiveTabId.mockResolvedValue(10);
    tabStateMock.getValidTabsWithMetadata.mockResolvedValue([
      { id: 10, title: 'Tab', url: 'https://example.com/' }
    ]);
    tabStateMock.withPreservedActiveTab.mockImplementation(
      async (_t: number, fn: () => Promise<unknown>) => fn()
    );
    actionsMock.executeScreenshot.mockResolvedValue({ output: 'screenshot taken' });
    vi.stubGlobal('chrome', {
      tabs: {
        get: vi.fn(async () => ({ id: 10, url: 'https://example.com/page?session=1' }))
      }
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

  async function inputEvents() {
    const evts = await store.getEvents();
    return evts.filter((e) => e.domain === 'input');
  }

  it('records input.action.start/end on screenshot action with redacted before/after url', async () => {
    const { computerTool } = await import('./computerTool');
    const result = await computerTool.execute({ action: 'screenshot', tabId: 10 } as never, {
      tabId: 10,
      toolUseId: 'tu-1',
      permissionManager: {
        checkPermission: vi.fn(async () => ({ allowed: true }))
      } as never
    });
    expect(result.output).toBe('screenshot taken');

    const events = await inputEvents();
    const names = events.map((e) => e.event);
    expect(names).toContain('input.action.start');
    expect(names).toContain('input.action.end');
    const start = events.find((e) => e.event === 'input.action.start')!;
    expect(start.data?.action).toBe('screenshot');
    expect(start.data?.refSource).toBe('none');
    expect(start.data?.beforeUrl).toBe('https://example.com/page?[redacted-query]');
    const end = events.find((e) => e.event === 'input.action.end')!;
    expect(end.data?.success).toBe(true);
    expect(end.data?.beforeAfterUrlSame).toBe(true);
    expect(end.data?.pageChanged).toBe(false);
  });

  it('records input.action.end error on thrown action', async () => {
    actionsMock.executeScreenshot.mockRejectedValue(new Error('cdp blew up'));
    const { computerTool } = await import('./computerTool');
    const result = await computerTool.execute({ action: 'screenshot', tabId: 10 } as never, {
      tabId: 10,
      toolUseId: 'tu-2',
      permissionManager: {
        checkPermission: vi.fn(async () => ({ allowed: true }))
      } as never
    });
    expect(result.error).toBeDefined();
    const events = await inputEvents();
    const end = events.find((e) => e.event === 'input.action.end');
    expect(end).toBeDefined();
    expect(end?.level).toBe('error');
  });

  it('records refSource=ref when ref provided', async () => {
    const { computerTool } = await import('./computerTool');
    await computerTool.execute({ action: 'left_click', ref: 'ref_5', tabId: 10 } as never, {
      tabId: 10,
      toolUseId: 'tu-3',
      permissionManager: {
        checkPermission: vi.fn(async () => ({ allowed: true }))
      } as never
    });
    const events = await inputEvents();
    const start = events.find((e) => e.event === 'input.action.start')!;
    expect(start.data?.refSource).toBe('ref');
    expect(start.data?.refId).toBe('ref_5');
  });

  it('does not record input events when debug is disabled', async () => {
    const { resetDebugRecorder } = await import('@/debug/recorder');
    resetDebugRecorder();
    const { computerTool } = await import('./computerTool');
    await computerTool.execute({ action: 'screenshot', tabId: 10 } as never, {
      tabId: 10,
      toolUseId: 'tu-4',
      permissionManager: {
        checkPermission: vi.fn(async () => ({ allowed: true }))
      } as never
    });
    const events = await inputEvents();
    expect(events).toHaveLength(0);
  });
});
