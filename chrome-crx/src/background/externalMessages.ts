import { handleOAuthRedirect } from "../extensionServices";
import { connectBridge, syncPermissions } from "../mcpRuntime";

const ALLOWED_ORIGINS = new Set([
  "https://open.bigmodel.cn",
  "https://coding.dashscope.aliyuncs.com",
]);

export interface ExternalMessageListenerDeps {
  connectNativeHost: () => Promise<boolean>;
}

export function registerExternalMessageListener({
  connectNativeHost,
}: ExternalMessageListenerDeps) {
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    void (async () => {
      const origin = sender.origin;
      if (!origin || !ALLOWED_ORIGINS.has(origin)) {
        sendResponse({ success: false, error: "Untrusted origin" });
        return;
      }

      if (message.type === "oauth_redirect") {
        const result = await handleOAuthRedirect(message.redirect_uri, sender.tab?.id);
        sendResponse(result);
        if (result.success) {
          void syncPermissions().then(() => connectBridge());
          void connectNativeHost();
        }
        return;
      }

      if (message.type === "ping") {
        sendResponse({ success: true, exists: true });
        return;
      }

      if (message.type === "onboarding_task") {
        chrome.runtime.sendMessage({
          type: "POPULATE_INPUT_TEXT",
          prompt: message.payload?.prompt,
        });
        sendResponse({ success: true });
      }
    })();

    return true;
  });
}
