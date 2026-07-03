import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  detachDebugger: vi.fn(),
  addTabToIndicatorGroup: vi.fn(),
  addLoadingPrefix: vi.fn(),
  hideAgentIndicatorsForTab: vi.fn(),
  removePrefix: vi.fn()
}));

vi.mock('../../extensionServices', () => ({
  StorageKeys: {
    ACTIVE_TOOL_CONTEXTS: 'activeToolContexts'
  },
  getStorageValue: vi.fn(),
  setStorageValue: vi.fn()
}));

vi.mock('../browserAutomation', () => ({
  cdpDebugger: {
    detachDebugger: fixtures.detachDebugger
  }
}));

vi.mock('../tabState', () => ({
  tabGroupManager: {
    addTabToIndicatorGroup: fixtures.addTabToIndicatorGroup,
    addLoadingPrefix: fixtures.addLoadingPrefix,
    hideAgentIndicatorsForTab: fixtures.hideAgentIndicatorsForTab,
    removePrefix: fixtures.removePrefix,
    findMainTabIdSync: vi.fn(() => undefined),
    getGroupMemberIds: vi.fn(() => []),
    getAllGroups: vi.fn(async () => []),
    clearIndicatorsForGroup: vi.fn(async () => {}),
    setGroupColor: vi.fn(async () => {})
  }
}));

const { startToolContext, cleanupAfterToolExecution } = await import('./toolContextState');

describe('toolContextState idle debugger timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fixtures.detachDebugger.mockResolvedValue(undefined);
    fixtures.addTabToIndicatorGroup.mockResolvedValue(undefined);
    fixtures.addLoadingPrefix.mockResolvedValue(undefined);
    fixtures.hideAgentIndicatorsForTab.mockResolvedValue(undefined);
    fixtures.removePrefix.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancels stale ungrouped debugger detach timers when a new tool starts', async () => {
    await startToolContext(7, 'read_page', 'req-1', vi.fn());
    cleanupAfterToolExecution(7);

    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
    await startToolContext(7, 'click', 'req-2', vi.fn());
    cleanupAfterToolExecution(7);

    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(fixtures.detachDebugger).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
    expect(fixtures.detachDebugger).toHaveBeenCalledTimes(1);
    expect(fixtures.detachDebugger).toHaveBeenCalledWith(7);
  });
});
