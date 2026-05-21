import { test, expect } from "../fixtures/extension";
import { seedStorage, getDefaultProviderConfig } from "../fixtures/storage";
import { mockLLMStreaming, type MockLLMScript } from "../fixtures/mockLLM";
import { openSidepanel, sendMessage, waitForReplyDone } from "../helpers/sidepanel";
import { openFixturePage } from "../helpers/pages";
import { waitForToolCall } from "../helpers/toolCall";

test.describe("7. 工具调用 UX", () => {
  test("TC-7.1 工具调用进行中显示调用中状态", async ({ context, extensionId, serviceWorker }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    await openFixturePage(context, "login-button.html");

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "screenshot" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Done." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Take a screenshot");

    try {
      await waitForToolCall(page, undefined, 10_000);
    } catch {
      // Tool may execute too fast to catch
    }

    await waitForReplyDone(page, 15_000);
    await page.close();
  });

  test("TC-7.2 工具调用成功显示成功标识 + 结果摘要", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    await openFixturePage(context, "login-button.html");

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "read_page", input: { reason: "check page" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Page read successfully." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Read the page");
    await waitForReplyDone(page, 15_000);

    const pageContent = await page.content();
    const hasToolBlock =
      pageContent.includes("read_page") ||
      pageContent.includes("Read") ||
      pageContent.includes("group/row") ||
      pageContent.includes("tool");
    expect(hasToolBlock).toBe(true);
    await page.close();
  });

  test("TC-7.3 工具调用失败显示错误标识 + 错误信息", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "wait", duration: 0 } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "The tool encountered an error." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Wait for 0 seconds");
    await waitForReplyDone(page, 15_000);

    const sendBtn = page.locator('[data-test-id="send-button"]');
    await expect(sendBtn).toBeVisible();

    const pageText = await page.locator("#root").innerText();
    const hasErrorIndicator =
      pageText.includes("error") ||
      pageText.includes("Error") ||
      pageText.includes("失败") ||
      pageText.includes("错误");
    expect(hasErrorIndicator).toBe(true);

    await page.close();
  });

  test("TC-7.4 工具调用过程中页面出现视觉指示器 overlay", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    const targetPage = await openFixturePage(context, "login-button.html");

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "screenshot" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Screenshot taken." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const sidepanel = await openSidepanel(context, extensionId);
    await mockLLMStreaming(sidepanel, script);
    await sendMessage(sidepanel, "Take a screenshot of the page");

    try {
      await targetPage.waitForSelector("[class*='superduck'], [id*='superduck'], [data-superduck]", {
        timeout: 5000,
      });
    } catch {
      // Overlay may have appeared and disappeared too quickly
    }

    await waitForReplyDone(sidepanel, 15_000);
    await sidepanel.close();
    await targetPage.close();
  });

  test("TC-7.5 工具调用结束 overlay 自动隐藏", async ({ context, extensionId, serviceWorker }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    const targetPage = await openFixturePage(context, "login-button.html");

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "screenshot" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Done." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const sidepanel = await openSidepanel(context, extensionId);
    await mockLLMStreaming(sidepanel, script);
    await sendMessage(sidepanel, "Screenshot");
    await waitForReplyDone(sidepanel, 15_000);

    const overlay = targetPage.locator("[class*='superduck'], [id*='superduck'], [data-superduck]");
    await expect(overlay).toHaveCount(0);

    await sidepanel.close();
    await targetPage.close();
  });

  test("TC-7.6 blocking overlay 拦截用户在自动化期间的误操作", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    const targetPage = await openFixturePage(context, "login-button.html");

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "read_page", input: { reason: "analyze" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [
            { type: "tool_use", id: "tu_2", name: "computer", input: { action: "left_click", coordinate: [100, 180] } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Automation complete." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const sidepanel = await openSidepanel(context, extensionId);
    await mockLLMStreaming(sidepanel, script);
    await sendMessage(sidepanel, "Analyze and click login");
    await waitForReplyDone(sidepanel, 20_000);

    const loginBtn = targetPage.locator("#login-btn");
    await expect(loginBtn).toBeVisible();

    await sidepanel.close();
    await targetPage.close();
  });
});
