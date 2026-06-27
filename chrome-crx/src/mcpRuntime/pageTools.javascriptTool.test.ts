import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from './pageToolsSupport/types';
import { startDebugSession, resetDebugRecorder } from '../debug/recorder';
import { InMemoryDebugStore } from '../debug/store';

const fixtures = vi.hoisted(() => {
  const checkPermission = vi.fn();
  const getEffectiveTabId = vi.fn();
  const getValidTabsWithMetadata = vi.fn();
  const withPreservedActiveTab = vi.fn();
  const adoptChildTabsFromOpener = vi.fn();
  const rememberChildTabNavigationPolicy = vi.fn();
  const clearWindowOpenEvents = vi.fn();
  const enablePageEvents = vi.fn();
  const consumeWindowOpenEvents = vi.fn();
  const sendCommand = vi.fn();
  const createPolicyCheckedChildTab = vi.fn();
  const filterPolicyAllowedTabs = vi.fn();
  const moveSearchNavigationToNewTab = vi.fn();

  return {
    checkPermission,
    getEffectiveTabId,
    getValidTabsWithMetadata,
    withPreservedActiveTab,
    adoptChildTabsFromOpener,
    rememberChildTabNavigationPolicy,
    clearWindowOpenEvents,
    enablePageEvents,
    consumeWindowOpenEvents,
    sendCommand,
    createPolicyCheckedChildTab,
    filterPolicyAllowedTabs,
    moveSearchNavigationToNewTab
  };
});

vi.mock('./tabState', () => ({
  domainCategoryCache: {
    getCategory: vi.fn(async () => null)
  },
  tabGroupManager: {
    getEffectiveTabId: fixtures.getEffectiveTabId,
    getValidTabsWithMetadata: fixtures.getValidTabsWithMetadata,
    withPreservedActiveTab: fixtures.withPreservedActiveTab,
    adoptChildTabsFromOpener: fixtures.adoptChildTabsFromOpener,
    rememberChildTabNavigationPolicy: fixtures.rememberChildTabNavigationPolicy
  }
}));

vi.mock('./cdp', () => ({
  cdpDebugger: {
    clearWindowOpenEvents: fixtures.clearWindowOpenEvents,
    enablePageEvents: fixtures.enablePageEvents,
    consumeWindowOpenEvents: fixtures.consumeWindowOpenEvents,
    sendCommand: fixtures.sendCommand
  },
  screenshotContextManager: {
    getLastScreenshot: vi.fn(),
    getContext: vi.fn(() => null)
  }
}));

vi.mock('./axSnapshot', () => ({
  takeSnapshotUnlocked: vi.fn(),
  SnapshotMaxCharsError: class SnapshotMaxCharsError extends Error {},
  normalizeSnapshotForDiff: vi.fn((value: string) => value),
  withSnapshotLock: vi.fn(async (_tabId: number, fn: () => Promise<unknown>) => fn())
}));

vi.mock('./screenshot/refBridge', () => ({
  registerRefsInPage: vi.fn(),
  pruneStaleRefs: vi.fn()
}));

vi.mock('./screenshot/annotatedScreenshot', () => ({
  captureAnnotatedScreenshot: vi.fn()
}));

vi.mock('./domainPermissions', () => ({
  PermissionTools: {
    EXECUTE_JAVASCRIPT: 'execute_javascript'
  },
  checkUrlSecurity: vi.fn(async () => null)
}));

vi.mock('./navigationIsolation', () => ({
  checkDomainCategoryForNavigation: vi.fn(async () => null),
  createPolicyCheckedChildTab: fixtures.createPolicyCheckedChildTab,
  filterPolicyAllowedTabs: fixtures.filterPolicyAllowedTabs,
  moveSearchNavigationToNewTab: fixtures.moveSearchNavigationToNewTab
}));

const chromeMock = vi.hoisted(() => ({
  tabs: {
    get: vi.fn(),
    onRemoved: {
      addListener: vi.fn()
    },
    onUpdated: {
      addListener: vi.fn()
    }
  },
  webNavigation: {
    onHistoryStateUpdated: {
      addListener: vi.fn()
    }
  }
}));

vi.stubGlobal('chrome', chromeMock);

const { javascriptTool } = await import('./pageTools');

const context: ToolContext = {
  tabId: 10,
  toolUseId: 'tool-use-1',
  permissionManager: {
    checkPermission: fixtures.checkPermission
  } as unknown as ToolContext['permissionManager']
};

beforeEach(() => {
  for (const fn of Object.values(fixtures)) fn.mockReset();
  chromeMock.tabs.get.mockReset();

  fixtures.checkPermission.mockResolvedValue({ allowed: true });
  fixtures.getEffectiveTabId.mockResolvedValue(10);
  fixtures.withPreservedActiveTab.mockImplementation(
    async (_tabId: number, action: () => Promise<unknown>) => action()
  );
  fixtures.adoptChildTabsFromOpener.mockResolvedValue([]);
  fixtures.consumeWindowOpenEvents.mockReturnValue([]);
  fixtures.sendCommand.mockResolvedValue({
    result: { type: 'string', value: 'ok' }
  });
  fixtures.createPolicyCheckedChildTab.mockResolvedValue(null);
  fixtures.filterPolicyAllowedTabs.mockImplementation(async (tabIds: number[]) => tabIds);
  fixtures.moveSearchNavigationToNewTab.mockResolvedValue([]);
  fixtures.getValidTabsWithMetadata.mockResolvedValue([
    { id: 10, title: 'Source', url: 'https://example.com/' },
    { id: 31, title: 'Search', url: 'https://example.com/search?q=agent' },
    { id: 41, title: 'Popup', url: 'https://example.com/child' }
  ]);
  chromeMock.tabs.get.mockResolvedValue({ id: 10, url: 'https://example.com/' });
});

describe('javascript_tool popup search isolation', () => {
  it('isolates same-tab search navigation even when JavaScript also opened a popup', async () => {
    fixtures.adoptChildTabsFromOpener.mockResolvedValue([41]);
    fixtures.filterPolicyAllowedTabs.mockResolvedValue([41]);
    fixtures.moveSearchNavigationToNewTab.mockResolvedValue([31]);

    const result = await javascriptTool.execute(
      {
        action: 'javascript_exec',
        text: 'window.open("/child"); location.href = "/search?q=agent"',
        tabId: 10
      },
      context
    );

    expect(fixtures.rememberChildTabNavigationPolicy).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        permissionManager: context.permissionManager,
        toolName: 'javascript_tool'
      })
    );
    expect(fixtures.consumeWindowOpenEvents).toHaveBeenCalledWith(10);
    expect(fixtures.moveSearchNavigationToNewTab).toHaveBeenCalledWith(
      expect.objectContaining({
        openerTabId: 10,
        previousUrl: 'https://example.com/',
        policy: expect.objectContaining({ toolName: 'javascript_tool' })
      })
    );
    expect(result.output).toContain('Opened new tabs in current group: 41, 31');
    expect(result.tabContext).toMatchObject({
      currentTabId: 10,
      executedOnTabId: 31
    });
  });
});

describe('javascript_tool debug instrumentation', () => {
  let debugStore: InMemoryDebugStore;

  beforeEach(async () => {
    debugStore = new InMemoryDebugStore();
    await startDebugSession({ store: debugStore });
  });

  afterEach(() => {
    resetDebugRecorder();
  });

  it('records javascript event sequence + js-result artifact on success', async () => {
    const result = await javascriptTool.execute(
      { action: 'javascript_exec', text: 'document.title', tabId: 10 },
      context
    );
    expect(result.output).toBeDefined();

    const events = (await debugStore.getEvents()).filter((e) => e.domain === 'javascript');
    const names = events.map((e) => e.event);
    expect(names).toContain('javascript.exec.start');
    expect(names).toContain('javascript.permission.check');
    expect(names).toContain('javascript.security.check');
    expect(names).toContain('javascript.runtime.evaluate.start');
    expect(names).toContain('javascript.runtime.evaluate.end');
    expect(names).toContain('javascript.exec.end');

    const start = events.find((e) => e.event === 'javascript.exec.start')!;
    expect(start.data?.codeHash).toMatch(/^fnv1a-/);
    expect(start.data?.codePreview).toBe('document.title');
    expect(start.data?.codeLength).toBe('document.title'.length);

    const perm = events.find((e) => e.event === 'javascript.permission.check')!;
    expect(perm.data?.allowed).toBe(true);

    const artifacts = await debugStore.listArtifacts();
    expect(artifacts.some((a) => a.type === 'js-result')).toBe(true);
  });

  it('records javascript.runtime.exception on eval exception', async () => {
    fixtures.sendCommand.mockResolvedValue({
      exceptionDetails: {
        exception: { description: 'ReferenceError: x is not defined' },
        url: 'https://example.com/script.js?token=1',
        lineNumber: 1,
        columnNumber: 0
      }
    });

    await javascriptTool.execute({ action: 'javascript_exec', text: 'x()', tabId: 10 }, context);

    const events = (await debugStore.getEvents()).filter((e) => e.domain === 'javascript');
    const exc = events.find((e) => e.event === 'javascript.runtime.exception');
    expect(exc).toBeDefined();
    expect(exc?.level).toBe('error');
    expect(exc?.data?.exceptionSummary).toContain('ReferenceError');
    expect(exc?.data?.sourceUrl).toBe('https://example.com/script.js?[redacted-query]');
    const execEnd = events.find((e) => e.event === 'javascript.exec.end');
    expect(execEnd?.data?.resultType).toBe('is_error');
  });

  it('records javascript.window_open.detected when window.open fires but no adoption', async () => {
    fixtures.adoptChildTabsFromOpener.mockResolvedValue([]);
    fixtures.consumeWindowOpenEvents.mockReturnValue([
      { url: 'https://popup.test/open?session=secret', timestamp: Date.now() }
    ]);
    fixtures.createPolicyCheckedChildTab.mockResolvedValue(null);

    await javascriptTool.execute(
      { action: 'javascript_exec', text: 'window.open("https://popup.test/open")', tabId: 10 },
      context
    );

    const events = (await debugStore.getEvents()).filter((e) => e.domain === 'javascript');
    const wo = events.find((e) => e.event === 'javascript.window_open.detected');
    expect(wo).toBeDefined();
    expect(wo?.data?.windowOpenCount).toBe(1);
    expect((wo?.data?.targetUrls as string[] | undefined)?.[0]).toBe(
      'https://popup.test/open?[redacted-query]'
    );
    expect(wo?.data?.adoptedTabIds).toEqual([]);
  });

  it('does not record javascript events when debug is disabled', async () => {
    resetDebugRecorder();
    await javascriptTool.execute({ action: 'javascript_exec', text: '1+1', tabId: 10 }, context);
    const events = (await debugStore.getEvents()).filter((e) => e.domain === 'javascript');
    expect(events).toHaveLength(0);
  });
});
