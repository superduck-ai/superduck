const ALLOWED_ORIGINS = new Set([
  'https://open.bigmodel.cn',
  'https://coding.dashscope.aliyuncs.com'
]);

export interface ExternalMessageListenerDeps {
  connectNativeHost: () => Promise<boolean>;
}

export function registerExternalMessageListener({
  connectNativeHost: _connectNativeHost
}: ExternalMessageListenerDeps) {
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    void (async () => {
      const origin = sender.origin;
      if (!origin || !ALLOWED_ORIGINS.has(origin)) {
        sendResponse({ success: false, error: 'Untrusted origin' });
        return;
      }

      if (!message || typeof message !== 'object') {
        sendResponse({ success: false, error: 'Invalid message' });
        return;
      }

      if (message.type === 'ping') {
        sendResponse({ success: true, exists: true });
        return;
      }

      if (message.type === 'onboarding_task') {
        const prompt = typeof message.payload?.prompt === 'string' ? message.payload.prompt : '';
        if (!prompt.trim()) {
          sendResponse({ success: false, error: 'Missing prompt' });
          return;
        }

        chrome.runtime.sendMessage({
          type: 'POPULATE_INPUT_TEXT',
          prompt,
          targetTabId: sender.tab?.id,
          autoSend: false
        });
        sendResponse({ success: true, autoSend: false });
        return;
      }

      sendResponse({ success: false, error: 'Unsupported message type' });
    })();

    return true;
  });
}
