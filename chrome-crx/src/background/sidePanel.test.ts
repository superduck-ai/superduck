import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mcpRuntimeMocks = vi.hoisted(() => ({
  tabGroupManager: {
    initialize: vi.fn(),
    findGroupByTab: vi.fn(),
    adoptOrphanedGroup: vi.fn(),
    createGroup: vi.fn()
  }
}));

vi.mock('../mcpRuntime', () => mcpRuntimeMocks);

import { createSidePanelController } from './sidePanel';

describe('createSidePanelController', () => {
  const sendMessage = vi.fn();
  const setOptions = vi.fn();
  const tabsGet = vi.fn();
  const sessionGet = vi.fn();
  const sessionSet = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    tabsGet.mockReturnValue({ id: 42, windowId: 7 });
    sessionGet.mockResolvedValue({});
    sessionSet.mockResolvedValue(undefined);
    mcpRuntimeMocks.tabGroupManager.initialize.mockResolvedValue(undefined);
    mcpRuntimeMocks.tabGroupManager.findGroupByTab.mockResolvedValue({
      isUnmanaged: false,
      chromeGroupId: 1
    });

    vi.stubGlobal('chrome', {
      runtime: {
        lastError: undefined,
        sendMessage
      },
      sidePanel: {
        setOptions
      },
      storage: {
        session: {
          get: sessionGet,
          set: sessionSet
        }
      },
      tabs: {
        get: tabsGet
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function flushAsyncSetup() {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
    }
  }

  it('retries runtime prompt delivery until a panel handles the message', async () => {
    const responses = [{ success: false, skipped: true }, { success: true }];
    sendMessage.mockImplementation(
      (_message: Record<string, unknown>, callback: (response?: unknown) => void) => {
        callback(responses.shift());
      }
    );

    const controller = createSidePanelController({
      connectNativeHost: vi.fn(async () => true)
    });
    const request = controller.openSidePanelRequest({ tabId: 42, prompt: 'Open the dashboard' });

    await flushAsyncSetup();
    await vi.advanceTimersByTimeAsync(800);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    await flushAsyncSetup();
    await vi.advanceTimersByTimeAsync(500);
    await request;

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith(
      {
        type: 'POPULATE_INPUT_TEXT',
        prompt: 'Open the dashboard',
        targetTabId: 42,
        permissionMode: undefined,
        selectedModel: undefined,
        attachments: undefined
      },
      expect.any(Function)
    );
  });
});
