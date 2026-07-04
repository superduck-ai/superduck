import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => {
  const onBeforeNavigate = {
    listeners: [] as Array<(details: { frameId: number; tabId: number; url: string }) => unknown>,
    addListener: vi.fn(
      (listener: (details: { frameId: number; tabId: number; url: string }) => unknown) => {
        onBeforeNavigate.listeners.push(listener);
      }
    )
  };
  return {
    onBeforeNavigate,
    hasActiveToolContext: vi.fn(),
    getActiveToolContext: vi.fn(),
    cleanupAfterToolExecution: vi.fn(),
    getTabRelationship: vi.fn(),
    getCategoryAndUpdateBlocklist: vi.fn(),
    getBlockedPageUrl: vi.fn()
  };
});

vi.mock('./toolExecution/toolContextState', () => ({
  hasActiveToolContext: fixtures.hasActiveToolContext,
  getActiveToolContext: fixtures.getActiveToolContext,
  cleanupAfterToolExecution: fixtures.cleanupAfterToolExecution
}));

vi.mock('./domainPermissions', () => ({
  getTabRelationship: fixtures.getTabRelationship,
  getCategoryAndUpdateBlocklist: fixtures.getCategoryAndUpdateBlocklist,
  getBlockedPageUrl: fixtures.getBlockedPageUrl
}));

const chromeMock = {
  webNavigation: {
    onBeforeNavigate: fixtures.onBeforeNavigate
  },
  tabs: {
    update: vi.fn(),
    get: vi.fn()
  }
};

vi.stubGlobal('chrome', chromeMock);

const { setNavigationGuardBootWaiter } = await import('./navigationGuard');

describe('navigationGuard cold-start gating', () => {
  beforeEach(() => {
    fixtures.hasActiveToolContext.mockReset();
    fixtures.getActiveToolContext.mockReset();
    fixtures.cleanupAfterToolExecution.mockReset();
    fixtures.getTabRelationship.mockReset();
    fixtures.getCategoryAndUpdateBlocklist.mockReset();
    fixtures.getBlockedPageUrl.mockReset();
    chromeMock.tabs.update.mockReset();
    chromeMock.tabs.get.mockReset();
    setNavigationGuardBootWaiter(undefined);

    fixtures.hasActiveToolContext.mockReturnValue(true);
    fixtures.getActiveToolContext.mockReturnValue({
      toolName: 'navigate',
      requestId: 'request-a',
      startTime: Date.now(),
      errorCallback: vi.fn()
    });
    fixtures.getTabRelationship.mockResolvedValue({ isMainTab: true, isSecondaryTab: false });
    fixtures.getCategoryAndUpdateBlocklist.mockResolvedValue('category1');
    fixtures.getBlockedPageUrl.mockReturnValue('chrome-extension://id/blocked.html');
    chromeMock.tabs.update.mockResolvedValue({});
    chromeMock.tabs.get.mockResolvedValue({ id: 7 });
  });

  it('waits for service-worker restore before evaluating active tool navigation', async () => {
    let resolveBoot!: () => void;
    setNavigationGuardBootWaiter(
      () =>
        new Promise<void>((resolve) => {
          resolveBoot = resolve;
        })
    );
    const listener = fixtures.onBeforeNavigate.listeners[0];

    const navigationPromise = listener({
      frameId: 0,
      tabId: 7,
      url: 'https://blocked.example/'
    }) as Promise<void>;
    await Promise.resolve();

    expect(fixtures.hasActiveToolContext).not.toHaveBeenCalled();
    expect(chromeMock.tabs.update).not.toHaveBeenCalled();

    resolveBoot();
    await navigationPromise;

    expect(fixtures.hasActiveToolContext).toHaveBeenCalledWith(7);
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(7, {
      url: 'chrome-extension://id/blocked.html'
    });
    expect(fixtures.cleanupAfterToolExecution).toHaveBeenCalledWith(7);
  });
});
