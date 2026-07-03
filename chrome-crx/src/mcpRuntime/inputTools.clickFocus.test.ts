import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from './pageToolsSupport/types';

const fixtures = vi.hoisted(() => {
  const checkPermission = vi.fn();
  const getEffectiveTabId = vi.fn();
  const createChildTabInGroup = vi.fn();
  const getValidTabsWithMetadata = vi.fn();
  const withPreservedActiveTab = vi.fn();
  const adoptChildTabsFromOpener = vi.fn();
  const rememberChildTabNavigationPolicy = vi.fn();
  const clearWindowOpenEvents = vi.fn();
  const enablePageEvents = vi.fn();
  const consumeWindowOpenEvents = vi.fn();
  const sendCommand = vi.fn();
  const click = vi.fn();
  const screenshot = vi.fn();
  const moveSearchNavigationToNewTab = vi.fn();
  const filterPolicyAllowedTabs = vi.fn();
  // refBridge 受控 mock:逐用例决定 role / backendNodeId（默认在 beforeEach 设为 null）
  const getRefRole = vi.fn();
  const getRefBackendNodeId = vi.fn();
  const getRefMetaByTab = vi.fn();
  const resolveStaleRef = vi.fn();
  const executeScript = vi.fn();

  return {
    checkPermission,
    getEffectiveTabId,
    createChildTabInGroup,
    getValidTabsWithMetadata,
    withPreservedActiveTab,
    adoptChildTabsFromOpener,
    rememberChildTabNavigationPolicy,
    clearWindowOpenEvents,
    enablePageEvents,
    consumeWindowOpenEvents,
    sendCommand,
    click,
    screenshot,
    moveSearchNavigationToNewTab,
    filterPolicyAllowedTabs,
    getRefRole,
    getRefBackendNodeId,
    getRefMetaByTab,
    resolveStaleRef,
    executeScript
  };
});

vi.mock('../extensionServices', () => ({
  PermissionActionType: {
    READ_PAGE_CONTENT: 'read_page_content',
    CLICK: 'click',
    TYPE: 'type'
  }
}));

vi.mock('./shared', () => ({
  PermissionTools: {
    TYPE: 'type',
    NAVIGATE: 'navigate'
  },
  checkUrlSecurity: vi.fn(async () => null),
  screenshotContextManager: {
    getLastScreenshot: vi.fn(),
    getContext: vi.fn(() => null)
  },
  waitForTabLoading: vi.fn()
}));

vi.mock('./tabState', () => ({
  waitForTabLoading: vi.fn(async () => undefined),
  tabGroupManager: {
    getEffectiveTabId: fixtures.getEffectiveTabId,
    createChildTabInGroup: fixtures.createChildTabInGroup,
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
    sendCommand: fixtures.sendCommand,
    click: fixtures.click,
    screenshot: fixtures.screenshot
  },
  checkDomainSecurity: vi.fn(async () => null),
  generateUniqueId: vi.fn(() => 'id-1'),
  screenshotToViewportCoords: vi.fn(),
  mapCoordinateToViewport: vi.fn((x: number, y: number) => [x, y]),
  scrollViaContentScript: vi.fn()
}));

vi.mock('./screenshot/refBridge', () => ({
  resolveStaleRef: fixtures.resolveStaleRef,
  getRefBackendNodeId: fixtures.getRefBackendNodeId,
  getRefRole: fixtures.getRefRole,
  getRefMetaByTab: fixtures.getRefMetaByTab
}));

vi.mock('./screenshot/annotatedScreenshot', () => ({
  captureAnnotatedScreenshot: vi.fn()
}));

vi.mock('./navigationIsolation', () => ({
  moveSearchNavigationToNewTab: fixtures.moveSearchNavigationToNewTab,
  checkDomainCategoryForNavigation: vi.fn(async () => null),
  createPolicyCheckedChildTab: vi.fn(async () => null),
  filterPolicyAllowedTabs: fixtures.filterPolicyAllowedTabs
}));

const chromeMock = vi.hoisted(() => ({
  tabs: {
    get: vi.fn()
  },
  scripting: {
    executeScript: vi.fn()
  }
}));

vi.stubGlobal('chrome', chromeMock);
// 让 executeScript 走 hoisted fixture,以便接线测试控制 content script 结果
chromeMock.scripting.executeScript = fixtures.executeScript;

const { computerTool } = await import('./inputTools/computerTool');
const { focusFocusableByRef } = await import('./inputTools/computerActions/clickActions');

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
  // scripting.executeScript 已指向 fixtures.executeScript,mockReset 会清掉它的实现,
  // 但引用仍是同一个 vi.fn,无需重新挂载。

  fixtures.checkPermission.mockResolvedValue({ allowed: true });
  fixtures.getRefRole.mockReturnValue(null);
  fixtures.getRefBackendNodeId.mockReturnValue(null);
  fixtures.getEffectiveTabId.mockResolvedValue(10);
  fixtures.withPreservedActiveTab.mockImplementation(
    async (_tabId: number, action: () => Promise<unknown>) => action()
  );
  fixtures.adoptChildTabsFromOpener.mockResolvedValue([]);
  fixtures.filterPolicyAllowedTabs.mockImplementation(async (tabIds: number[]) => tabIds);
  fixtures.consumeWindowOpenEvents.mockReturnValue([]);
  fixtures.moveSearchNavigationToNewTab.mockResolvedValue([]);
  fixtures.click.mockResolvedValue(undefined);
  fixtures.screenshot.mockResolvedValue({
    base64: 'abc',
    format: 'png',
    width: 800,
    height: 600
  });
  fixtures.sendCommand.mockResolvedValue(undefined);
  fixtures.getValidTabsWithMetadata.mockResolvedValue([
    { id: 10, title: 'Source', url: 'https://example.com/' }
  ]);
  chromeMock.tabs.get.mockResolvedValue({ id: 10, url: 'https://example.com/' });
});

describe('focusFocusableByRef', () => {
  it('focuses a textbox ref by backendNodeId', async () => {
    fixtures.getRefRole.mockReturnValue('textbox');
    fixtures.getRefBackendNodeId.mockReturnValue(555);

    await focusFocusableByRef(10, 'ref_3');

    expect(fixtures.sendCommand).toHaveBeenCalledWith(10, 'DOM.focus', { backendNodeId: 555 });
  });

  it.each(['searchbox', 'combobox', 'spinbutton'] as const)(
    'focuses a %s ref (focusable input role set)',
    async (role) => {
      fixtures.getRefRole.mockReturnValue(role);
      fixtures.getRefBackendNodeId.mockReturnValue(7);

      await focusFocusableByRef(10, 'ref_x');

      expect(fixtures.sendCommand).toHaveBeenCalledWith(10, 'DOM.focus', { backendNodeId: 7 });
    }
  );

  it.each(['link', 'button', 'checkbox', 'radio', 'menuitem', 'tab'])(
    'does NOT focus a non-input %s role',
    async (role) => {
      fixtures.getRefRole.mockReturnValue(role);
      fixtures.getRefBackendNodeId.mockReturnValue(9);

      await focusFocusableByRef(10, 'ref_y');

      expect(fixtures.sendCommand).not.toHaveBeenCalledWith(
        expect.any(Number),
        'DOM.focus',
        expect.any(Object)
      );
    }
  );

  it('skips focus when ref has no backendNodeId', async () => {
    fixtures.getRefRole.mockReturnValue('textbox');
    fixtures.getRefBackendNodeId.mockReturnValue(null);

    await focusFocusableByRef(10, 'ref_z');

    expect(fixtures.sendCommand).not.toHaveBeenCalled();
  });

  it('skips focus when ref is undefined (coordinate clicks)', async () => {
    await focusFocusableByRef(10, undefined);

    expect(fixtures.sendCommand).not.toHaveBeenCalled();
  });

  it('swallows DOM.focus failures without throwing (best-effort)', async () => {
    fixtures.getRefRole.mockReturnValue('textbox');
    fixtures.getRefBackendNodeId.mockReturnValue(11);
    fixtures.sendCommand.mockRejectedValue(new Error('node not found'));

    await expect(focusFocusableByRef(10, 'ref_w')).resolves.toBeUndefined();
  });
});

describe('executeClick focuses focusable ref after click', () => {
  // 让 ref 路径走通:content script 返回成功坐标 + hitTest 命中 backendNodeId。
  function setupRefPath(backendNodeId: number, role: string) {
    fixtures.getRefRole.mockReturnValue(role);
    fixtures.getRefBackendNodeId.mockReturnValue(backendNodeId);
    fixtures.executeScript.mockResolvedValue([
      { result: { success: true, coordinates: [50, 60] } }
    ]);
    fixtures.sendCommand.mockImplementation((_tabId: number, method: string) => {
      if (method === 'DOM.getContentQuads') {
        // 稳定 quad,2 帧内收敛
        return Promise.resolve({ quads: [[0, 0, 100, 0, 100, 20, 0, 20]] });
      }
      if (method === 'DOM.getNodeForLocation') {
        return Promise.resolve({ backendNodeId });
      }
      return Promise.resolve(undefined);
    });
  }

  it('focuses a textbox after left_click --ref', async () => {
    setupRefPath(555, 'textbox');

    const result = await computerTool.execute(
      { action: 'left_click', ref: 'ref_3', tabId: 10 },
      context
    );

    expect(fixtures.click).toHaveBeenCalled();
    expect(fixtures.sendCommand).toHaveBeenCalledWith(10, 'DOM.focus', { backendNodeId: 555 });
    expect(result.error).toBeUndefined();
  });

  it('does not focus a link after left_click --ref', async () => {
    setupRefPath(555, 'link');

    await computerTool.execute({ action: 'left_click', ref: 'ref_3', tabId: 10 }, context);

    expect(fixtures.click).toHaveBeenCalled();
    expect(fixtures.sendCommand).not.toHaveBeenCalledWith(
      expect.any(Number),
      'DOM.focus',
      expect.any(Object)
    );
  });
});
