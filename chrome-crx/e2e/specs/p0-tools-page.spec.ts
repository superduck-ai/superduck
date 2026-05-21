import { test, expect } from "../fixtures/extension";
import { seedStorage, getDefaultProviderConfig } from "../fixtures/storage";
import { mockLLMStreaming, type MockLLMScript } from "../fixtures/mockLLM";
import { openSidepanel, sendMessage, waitForReplyDone } from "../helpers/sidepanel";
import { openFixturePage } from "../helpers/pages";

test.describe("4. 工具调用 - 页面读取 pageTools", () => {
  test("TC-4.1 get_url 返回当前活跃 tab 的 URL", async ({ context, extensionId, serviceWorker }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    const targetPage = await openFixturePage(context, "login-button.html");
    const targetUrl = targetPage.url();

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "screenshot" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: `The current URL is: ${targetUrl}` }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "What URL am I on?");
    await waitForReplyDone(page, 15_000);
    await page.waitForSelector(".superduck-response", { timeout: 15_000 });
    const response = await page.locator(".superduck-response").last().textContent();
    expect(response).toContain(targetUrl);
    await page.close();
    await targetPage.close();
  });

  test("TC-4.2 get_title 返回当前 tab 的 document.title", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    const targetPage = await openFixturePage(context, "login-button.html");
    const expectedTitle = await targetPage.title();

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "read_page", input: { reason: "get title" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: `The page title is: ${expectedTitle}` }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "What is the page title?");
    await waitForReplyDone(page, 15_000);

    await expect(page.locator(".superduck-response").last()).toContainText(expectedTitle);

    await page.close();
    await targetPage.close();
  });

  test("TC-4.3 get_a11y_tree 返回结构化无障碍树", async ({
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
            { type: "tool_use", id: "tu_1", name: "read_page", input: { reason: "accessibility tree" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "The page contains a login button and a navigation link." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Get the accessibility tree");
    await waitForReplyDone(page, 15_000);
    await page.close();
  });

  test("TC-4.4 query_selector 命中存在元素时返回 ref", async ({
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
            { type: "tool_use", id: "tu_1", name: "find", input: { query: "#login-btn" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Found the login button element." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Find the login button");
    await waitForReplyDone(page, 15_000);
    await page.close();
  });

  test("TC-4.5 query_selector 未命中时返回明确未找到错误", async ({
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
            { type: "tool_use", id: "tu_1", name: "find", input: { query: "#nonexistent-element" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "The element was not found on the page." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Find nonexistent element");
    await waitForReplyDone(page, 15_000);
    await page.close();
  });

  test("TC-4.6 scroll 工具按指定方向滚动页面", async ({ context, extensionId, serviceWorker }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    await openFixturePage(context, "long-article.html");

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "scroll", coordinate: [640, 360], scroll_direction: "down", scroll_amount: 5 } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Scrolled down the page." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Scroll down");
    await waitForReplyDone(page, 15_000);
    await page.close();
  });

  test("TC-4.7 wait 工具按指定毫秒数等待后返回", async ({ context, extensionId, serviceWorker }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "wait", duration: 0.5 } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Waited 0.5s successfully." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Wait for 500ms");
    await waitForReplyDone(page, 15_000);
    await page.close();
  });
});
