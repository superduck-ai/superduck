import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  detachDebugger: vi.fn(),
  addTabToIndicatorGroup: vi.fn(),
  addLoadingPrefix: vi.fn(),
  hideAgentIndicatorsForTab: vi.fn(),
  removePrefix: vi.fn(),
  getStorageValue: vi.fn(),
  setStorageValue: vi.fn(),
  chromeTabsGet: vi.fn(),
  alarmsCreate: vi.fn(),
  alarmsClear: vi.fn()
}));

vi.mock('../../extensionServices', () => ({
  StorageKeys: {
    ACTIVE_TOOL_CONTEXTS: 'activeToolContexts',
    TOOL_CONTEXT_DEADLINES: 'toolContextDeadlines'
  },
  getStorageValue: fixtures.getStorageValue,
  setStorageValue: fixtures.setStorageValue
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
const {
  ACTIVE_TOOL_CONTEXT_TTL_MS,
  handleToolContextAlarm,
  hasActiveToolContext,
  restoreActiveToolContextsFromStorage
} = await import('./toolContextState');

async function flushMicrotasks(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

describe('toolContextState idle debugger timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fixtures.detachDebugger.mockResolvedValue(undefined);
    fixtures.addTabToIndicatorGroup.mockResolvedValue(undefined);
    fixtures.addLoadingPrefix.mockResolvedValue(undefined);
    fixtures.hideAgentIndicatorsForTab.mockResolvedValue(undefined);
    fixtures.removePrefix.mockResolvedValue(undefined);
    fixtures.getStorageValue.mockResolvedValue(undefined);
    fixtures.setStorageValue.mockResolvedValue(undefined);
    fixtures.chromeTabsGet.mockResolvedValue({ id: 7 });
    fixtures.alarmsCreate.mockResolvedValue(undefined);
    fixtures.alarmsClear.mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      tabs: {
        get: fixtures.chromeTabsGet
      },
      alarms: {
        create: fixtures.alarmsCreate,
        clear: fixtures.alarmsClear
      }
    });
  });

  afterEach(async () => {
    await flushMicrotasks(50);
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

  it('arms active tool context expiry when a tool starts', async () => {
    vi.setSystemTime(1_000);

    await startToolContext(7, 'read_page', 'req-1', vi.fn());
    await flushMicrotasks();

    expect(fixtures.setStorageValue).toHaveBeenCalledWith('toolContextDeadlines', {
      idleCleanup: {},
      debuggerDetach: {},
      activeContextExpiry: {
        'tab:7': {
          targetType: 'tab',
          targetId: 7,
          dueAt: 1_000 + ACTIVE_TOOL_CONTEXT_TTL_MS,
          memberSnapshot: [7]
        }
      }
    });
    expect(fixtures.alarmsCreate).toHaveBeenCalledWith(
      'superduck.toolContext.activeContextExpiry:tab:7',
      { when: 1_000 + ACTIVE_TOOL_CONTEXT_TTL_MS }
    );
  });

  it('does not remove a newer active-context deadline after stale cleanup awaits', async () => {
    vi.setSystemTime(1_000);
    let resumeRemovePrefix!: () => void;
    fixtures.removePrefix.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resumeRemovePrefix = resolve;
      })
    );

    await startToolContext(7, 'read_page', 'old-req', vi.fn());
    fixtures.getStorageValue.mockImplementation(async (key: string) => {
      if (key === 'toolContextDeadlines') {
        return {
          idleCleanup: {},
          debuggerDetach: {},
          activeContextExpiry: {
            'tab:7': {
              targetType: 'tab',
              targetId: 7,
              dueAt: 1_000 + ACTIVE_TOOL_CONTEXT_TTL_MS,
              memberSnapshot: [7]
            }
          }
        };
      }
      return undefined;
    });
    const alarmPromise = handleToolContextAlarm('superduck.toolContext.activeContextExpiry:tab:7');
    await vi.waitFor(() => expect(fixtures.removePrefix).toHaveBeenCalledWith(7));

    vi.setSystemTime(2_000);
    await startToolContext(7, 'click', 'new-req', vi.fn());
    resumeRemovePrefix();
    await alarmPromise;
    await flushMicrotasks();

    expect(hasActiveToolContext(7)).toBe(true);
    expect(fixtures.hideAgentIndicatorsForTab).not.toHaveBeenCalled();
    expect(fixtures.detachDebugger).not.toHaveBeenCalled();
    expect(fixtures.setStorageValue).toHaveBeenCalledWith('toolContextDeadlines', {
      idleCleanup: {},
      debuggerDetach: {},
      activeContextExpiry: {
        'tab:7': {
          targetType: 'tab',
          targetId: 7,
          dueAt: 2_000 + ACTIVE_TOOL_CONTEXT_TTL_MS,
          memberSnapshot: [7]
        }
      }
    });
  });

  it('does not resurrect a deleted active-context deadline from stale storage', async () => {
    vi.setSystemTime(1_000);
    fixtures.getStorageValue.mockImplementation(async (key: string) => {
      if (key === 'toolContextDeadlines') {
        return {
          idleCleanup: {},
          debuggerDetach: {},
          activeContextExpiry: {
            'tab:7': {
              targetType: 'tab',
              targetId: 7,
              dueAt: 1_000 + ACTIVE_TOOL_CONTEXT_TTL_MS,
              memberSnapshot: [7]
            }
          }
        };
      }
      return undefined;
    });

    await startToolContext(7, 'read_page', 'req-1', vi.fn());
    fixtures.alarmsClear.mockClear();
    cleanupAfterToolExecution(7);

    expect(fixtures.alarmsClear).toHaveBeenCalledWith(
      'superduck.toolContext.activeContextExpiry:tab:7'
    );
    fixtures.alarmsClear.mockClear();

    await handleToolContextAlarm('superduck.toolContext.activeContextExpiry:tab:7');

    expect(fixtures.alarmsClear).not.toHaveBeenCalledWith(
      'superduck.toolContext.activeContextExpiry:tab:7'
    );
  });

  it('prunes stale and missing active tool contexts during cold-start restore', async () => {
    const now = Date.now();
    fixtures.getStorageValue.mockImplementation(async (key: string) => {
      if (key === 'activeToolContexts') {
        return {
          '7': {
            toolName: 'click',
            requestId: 'fresh',
            startTime: now - 1000
          },
          '8': {
            toolName: 'type',
            requestId: 'stale',
            startTime: now - ACTIVE_TOOL_CONTEXT_TTL_MS - 1
          },
          '9': {
            toolName: 'read_page',
            requestId: 'missing',
            startTime: now - 1000
          }
        };
      }
      if (key === 'toolContextDeadlines') return { idleCleanup: {}, debuggerDetach: {} };
      return undefined;
    });
    fixtures.chromeTabsGet.mockImplementation(async (tabId: number) => {
      if (tabId === 7) return { id: 7 };
      throw new Error(`No tab ${tabId}`);
    });

    await restoreActiveToolContextsFromStorage();
    await flushMicrotasks();

    expect(hasActiveToolContext(7)).toBe(true);
    expect(hasActiveToolContext(8)).toBe(false);
    expect(hasActiveToolContext(9)).toBe(false);
    expect(fixtures.setStorageValue).toHaveBeenCalledWith('activeToolContexts', {
      '7': {
        toolName: 'click',
        requestId: 'fresh',
        startTime: now - 1000
      }
    });
    expect(fixtures.addTabToIndicatorGroup).toHaveBeenCalledWith({
      tabId: 7,
      isRunning: true,
      isMcp: true
    });
    expect(fixtures.addLoadingPrefix).toHaveBeenCalledWith(7);
    expect(fixtures.setStorageValue).toHaveBeenCalledWith('toolContextDeadlines', {
      idleCleanup: {},
      debuggerDetach: {},
      activeContextExpiry: {
        'tab:7': {
          targetType: 'tab',
          targetId: 7,
          dueAt: now - 1000 + ACTIVE_TOOL_CONTEXT_TTL_MS,
          memberSnapshot: [7]
        }
      }
    });
  });

  it('executes overdue persisted debugger detach deadlines after a cold start', async () => {
    fixtures.getStorageValue.mockImplementation(async (key: string) => {
      if (key === 'activeToolContexts') return {};
      if (key === 'toolContextDeadlines') {
        return {
          idleCleanup: {},
          debuggerDetach: {
            'tab:7': {
              targetType: 'tab',
              targetId: 7,
              dueAt: Date.now() - 1
            }
          }
        };
      }
      return undefined;
    });

    await restoreActiveToolContextsFromStorage();

    expect(fixtures.detachDebugger).toHaveBeenCalledWith(7);
    expect(fixtures.alarmsClear).toHaveBeenCalledWith('superduck.toolContext.debuggerDetach:tab:7');
  });

  it('expires restored active tool contexts with the persisted TTL alarm', async () => {
    const startTime = Date.now() - 1000;
    fixtures.getStorageValue.mockImplementation(async (key: string) => {
      if (key === 'activeToolContexts') {
        return {
          '7': {
            toolName: 'click',
            requestId: 'fresh',
            startTime
          }
        };
      }
      if (key === 'toolContextDeadlines') {
        return {
          idleCleanup: {},
          debuggerDetach: {},
          activeContextExpiry: {
            'tab:7': {
              targetType: 'tab',
              targetId: 7,
              dueAt: startTime + ACTIVE_TOOL_CONTEXT_TTL_MS,
              memberSnapshot: [7]
            }
          }
        };
      }
      return undefined;
    });

    await restoreActiveToolContextsFromStorage();
    expect(hasActiveToolContext(7)).toBe(true);

    vi.setSystemTime(startTime + ACTIVE_TOOL_CONTEXT_TTL_MS);
    await handleToolContextAlarm('superduck.toolContext.activeContextExpiry:tab:7');

    expect(hasActiveToolContext(7)).toBe(false);
    expect(fixtures.removePrefix).toHaveBeenCalledWith(7);
    expect(fixtures.hideAgentIndicatorsForTab).toHaveBeenCalledWith(7);
    expect(fixtures.detachDebugger).toHaveBeenCalledWith(7);
    expect(fixtures.setStorageValue).toHaveBeenCalledWith('activeToolContexts', {});
    expect(fixtures.alarmsClear).toHaveBeenCalledWith(
      'superduck.toolContext.activeContextExpiry:tab:7'
    );
  });
});
