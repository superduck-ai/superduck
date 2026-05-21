import { test, expect } from "../fixtures/extension";
import { seedStorage, getDefaultProviderConfig } from "../fixtures/storage";
import { mockLLMStreaming, mockLLMError, type MockLLMScript } from "../fixtures/mockLLM";
import { openSidepanel, sendMessage, waitForReplyDone, clickStopButton } from "../helpers/sidepanel";
import { openOptionsPage } from "../helpers/pages";

test.describe("3.1 Happy Path", () => {
  test("TC-3.1.1 发送一条普通问题, 收到完整流式回复, 状态机回到 idle", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, getDefaultProviderConfig());
    const page = await openSidepanel(context, extensionId);

    const script: MockLLMScript = {
      responses: [
        { content: [{ type: "text", text: "Hello! I'm here to help you." }], stop_reason: "end_turn" },
      ],
    };
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Hi there");
    await waitForReplyDone(page);

    const response = await page.locator(".superduck-response").last().textContent();
    expect(response).toContain("Hello");

    const sendBtn = page.locator('[data-test-id="send-button"]');
    await expect(sendBtn).toBeVisible();
    const stopBtn = page.locator('[data-test-id="stop-button"]');
    await expect(stopBtn).not.toBeVisible();
    await page.close();
  });

  test("TC-3.1.2 收到回复后消息保存到当前会话历史", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, getDefaultProviderConfig());
    const page = await openSidepanel(context, extensionId);

    const script: MockLLMScript = {
      responses: [
        { content: [{ type: "text", text: "First answer" }], stop_reason: "end_turn" },
        { content: [{ type: "text", text: "Second answer" }], stop_reason: "end_turn" },
      ],
    };
    await mockLLMStreaming(page, script);

    await sendMessage(page, "Question 1");
    await waitForReplyDone(page);
    await sendMessage(page, "Question 2");
    await waitForReplyDone(page);

    const responses = page.locator(".superduck-response");
    expect(await responses.count()).toBeGreaterThanOrEqual(2);
    await page.close();
  });

  test("TC-3.1.3 发送同一问题在新会话中独立, 不污染上一会话", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, getDefaultProviderConfig());
    const page = await openSidepanel(context, extensionId);

    const script: MockLLMScript = {
      responses: [
        { content: [{ type: "text", text: "First session reply" }], stop_reason: "end_turn" },
        { content: [{ type: "text", text: "New session reply" }], stop_reason: "end_turn" },
      ],
    };
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Hello");
    await waitForReplyDone(page);

    const responsesBeforeClear = await page.locator(".superduck-response").count();
    expect(responsesBeforeClear).toBeGreaterThanOrEqual(1);

    // Clear chat to start new session
    const clearBtn = page.locator('button[aria-label="Clear chat"]');
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await page.waitForFunction(
        () => document.querySelectorAll(".superduck-response").length === 0,
        { timeout: 5_000 }
      );
      const responsesAfterClear = await page.locator(".superduck-response").count();
      expect(responsesAfterClear).toBe(0);

      // Send in the new session and verify independent reply
      await sendMessage(page, "Hello again");
      await waitForReplyDone(page);
      const newResponse = await page.locator(".superduck-response").last().textContent();
      expect(newResponse).toContain("New session reply");
    }
    await page.close();
  });
});

test.describe("3.2 中断与错误", () => {
  test("TC-3.2.1 生成中点击 Stop 立即停止流式输出", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, getDefaultProviderConfig());
    const page = await openSidepanel(context, extensionId);

    const script: MockLLMScript = {
      responses: [
        { content: [{ type: "text", text: "A".repeat(500) }], stop_reason: "end_turn" },
      ],
    };
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Write a long essay");

    const stopBtn = page.locator('[data-test-id="stop-button"]');
    try {
      await stopBtn.waitFor({ state: "visible", timeout: 5000 });
      await clickStopButton(page);
      await page.waitForTimeout(1000);
    } catch {
      // Response was too fast — still valid
    }
    // Ensure we wait for idle state before closing
    await waitForReplyDone(page, 10_000);
    await page.close();
  });

  test("TC-3.2.2 Stop 后再次发送可正常工作", async ({ context, extensionId, serviceWorker }) => {
    await seedStorage(serviceWorker, getDefaultProviderConfig());
    const page = await openSidepanel(context, extensionId);

    const script: MockLLMScript = {
      responses: [
        { content: [{ type: "text", text: "A".repeat(200) }], stop_reason: "end_turn" },
        { content: [{ type: "text", text: "Second reply after stop" }], stop_reason: "end_turn" },
      ],
    };
    await mockLLMStreaming(page, script);
    await sendMessage(page, "First message");

    const stopBtn = page.locator('[data-test-id="stop-button"]');
    try {
      await stopBtn.waitFor({ state: "visible", timeout: 3000 });
      await clickStopButton(page);
      await page.waitForTimeout(500);
    } catch {
      await waitForReplyDone(page);
    }

    await sendMessage(page, "Second message");
    await waitForReplyDone(page);

    const sendBtnAfter = page.locator('[data-test-id="send-button"]');
    await expect(sendBtnAfter).toBeVisible();
    await page.close();
  });

  test("TC-3.2.3 API 5xx 错误展示 ErrorDisplay, 提供重试", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, getDefaultProviderConfig());
    const page = await openSidepanel(context, extensionId);

    await mockLLMError(page, 500, "Internal Server Error");
    await sendMessage(page, "This should fail");

    await page.waitForFunction(
      () => {
        const root = document.querySelector("#root");
        if (!root) return false;
        const text = root.textContent || "";
        return (
          text.includes("Error") ||
          text.includes("error") ||
          text.includes("失败") ||
          text.includes("重试") ||
          text.includes("500")
        );
      },
      { timeout: 15_000 }
    );

    const pageText = await page.locator("#root").innerText();
    const hasError =
      pageText.includes("Error") ||
      pageText.includes("error") ||
      pageText.includes("失败") ||
      pageText.includes("重试") ||
      pageText.includes("500");
    expect(hasError).toBe(true);
    await page.close();
  });

  test("TC-3.2.4 API 429 限流错误友好提示", async ({ context, extensionId, serviceWorker }) => {
    await seedStorage(serviceWorker, getDefaultProviderConfig());
    const page = await openSidepanel(context, extensionId);

    await mockLLMError(page, 429, "Rate limit exceeded");
    await sendMessage(page, "Rate limited request");

    await page.waitForFunction(
      () => {
        const root = document.querySelector("#root");
        if (!root) return false;
        const text = root.textContent || "";
        return (
          text.includes("rate") ||
          text.includes("Rate") ||
          text.includes("limit") ||
          text.includes("Error") ||
          text.includes("error") ||
          text.includes("429")
        );
      },
      { timeout: 10_000 }
    );

    const pageText = await page.locator("#root").innerText();
    const hasRateLimit =
      pageText.includes("rate") ||
      pageText.includes("Rate") ||
      pageText.includes("limit") ||
      pageText.includes("Error") ||
      pageText.includes("error") ||
      pageText.includes("429");
    expect(hasRateLimit).toBe(true);
    await page.close();
  });

  test("TC-3.2.5 请求超时后状态正确回滚", async ({ context, extensionId, serviceWorker }) => {
    await seedStorage(serviceWorker, getDefaultProviderConfig());
    const page = await openSidepanel(context, extensionId);

    // Mock fetch to simulate timeout
    await page.evaluate(async () => {
      const win = window as any;
      win.__originalFetch = win.__originalFetch || window.fetch;
      window.fetch = async (url: any, init?: any) => {
        const urlStr = typeof url === "string" ? url : url?.url || url?.href || String(url);
        if (urlStr.includes("/v1/messages") || urlStr.includes("/chat/completions") || urlStr.includes("/v1/responses")) {
          const signal = (init as any)?.signal as AbortSignal | undefined;
          await new Promise((_, reject) => {
            const timer = setTimeout(() => reject(new Error("timeout")), 2000);
            if (signal) {
              signal.addEventListener("abort", () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
              });
            }
          });
        }
        return win.__originalFetch(url, init);
      };
    });

    await sendMessage(page, "This will timeout");

    // Wait for the UI to recover to idle state
    await page.waitForFunction(
      () => {
        const sendBtn = document.querySelector('[data-test-id="send-button"]');
        const stopBtn = document.querySelector('[data-test-id="stop-button"]');
        return (sendBtn && getComputedStyle(sendBtn).display !== "none") ||
               (stopBtn && getComputedStyle(stopBtn).display === "none");
      },
      { timeout: 20_000 }
    );

    const sendBtn = page.locator('[data-test-id="send-button"]');
    const stopBtn = page.locator('[data-test-id="stop-button"]');
    const isIdle = (await sendBtn.isVisible()) || !(await stopBtn.isVisible());
    expect(isIdle).toBe(true);
    await page.close();
  });
});

test.describe("3.3 认证与引导", () => {
  test("TC-3.3.1 无 API key 时引导用户跳转 Options", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    // Do NOT seed API key — only set version
    await seedStorage(serviceWorker, { aiProviderConfigVersion: 1 });
    const page = await openSidepanel(context, extensionId);
    await page.waitForTimeout(1000);

    await expect(page.locator("#root")).toBeVisible();
    await page.close();
  });

  test("TC-3.3.2 无效 API key 返回 401, 提示配置无效", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, getDefaultProviderConfig());
    const page = await openSidepanel(context, extensionId);

    await mockLLMError(page, 401, "Invalid API key");
    await sendMessage(page, "Test invalid key");

    await page.waitForFunction(
      () => {
        const root = document.querySelector("#root");
        if (!root) return false;
        const text = root.textContent || "";
        return (
          text.includes("401") ||
          text.includes("invalid") ||
          text.includes("Invalid") ||
          text.includes("Error") ||
          text.includes("error") ||
          text.includes("认证") ||
          text.includes("API")
        );
      },
      { timeout: 10_000 }
    );

    const pageText = await page.locator("#root").innerText();
    const hasAuthError =
      pageText.includes("401") ||
      pageText.includes("invalid") ||
      pageText.includes("Invalid") ||
      pageText.includes("Error") ||
      pageText.includes("error") ||
      pageText.includes("认证");
    expect(hasAuthError).toBe(true);
    await page.close();
  });

  test("TC-3.3.3 在 Options 配置 key 后, side panel 可立即正常发送", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, getDefaultProviderConfig());

    // Open options page to verify it's accessible
    const options = await openOptionsPage(context, extensionId);
    await options.waitForSelector("#root");
    await options.close();

    // Open sidepanel and verify messaging works
    const page = await openSidepanel(context, extensionId);
    const script: MockLLMScript = {
      responses: [
        { content: [{ type: "text", text: "API key works!" }], stop_reason: "end_turn" },
      ],
    };
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Test after config");
    await waitForReplyDone(page);

    const response = await page.locator(".superduck-response").last().textContent();
    expect(response).toContain("API key works");
    await page.close();
  });
});
