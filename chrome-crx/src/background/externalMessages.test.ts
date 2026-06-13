import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerExternalMessageListener } from './externalMessages';

describe('registerExternalMessageListener', () => {
  const addListener = vi.fn();
  const sendMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    sendMessage.mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      runtime: {
        onMessageExternal: {
          addListener
        },
        sendMessage
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function registerAndGetListener() {
    registerExternalMessageListener({
      connectNativeHost: vi.fn(async () => true)
    });
    return addListener.mock.calls[0][0] as (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => boolean;
  }

  it('requires user confirmation for external onboarding prompts', async () => {
    const listener = registerAndGetListener();
    const sendResponse = vi.fn();

    const keepAlive = listener(
      { type: 'onboarding_task', payload: { prompt: 'Open the dashboard' } },
      { origin: 'https://open.bigmodel.cn', tab: { id: 42 } } as chrome.runtime.MessageSender,
      sendResponse
    );

    expect(keepAlive).toBe(true);
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({ success: true, autoSend: false })
    );
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'POPULATE_INPUT_TEXT',
      prompt: 'Open the dashboard',
      targetTabId: 42,
      autoSend: false
    });
  });

  it('rejects onboarding prompts from untrusted origins', async () => {
    const listener = registerAndGetListener();
    const sendResponse = vi.fn();

    listener(
      { type: 'onboarding_task', payload: { prompt: 'Run privileged task' } },
      { origin: 'https://example.com', tab: { id: 42 } } as chrome.runtime.MessageSender,
      sendResponse
    );

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Untrusted origin' })
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('rejects onboarding prompts without a prompt string', async () => {
    const listener = registerAndGetListener();
    const sendResponse = vi.fn();

    listener(
      { type: 'onboarding_task', payload: {} },
      {
        origin: 'https://coding.dashscope.aliyuncs.com',
        tab: { id: 42 }
      } as chrome.runtime.MessageSender,
      sendResponse
    );

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Missing prompt' })
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
