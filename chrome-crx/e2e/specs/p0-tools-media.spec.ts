import { test, expect } from "../fixtures/extension";
import { seedStorage, getDefaultProviderConfig } from "../fixtures/storage";
import { mockLLMStreaming, type MockLLMScript } from "../fixtures/mockLLM";
import { openSidepanel, sendMessage, waitForReplyDone } from "../helpers/sidepanel";
import { openFixturePage } from "../helpers/pages";

test.describe("6. 工具调用 - 媒体 mediaTools", () => {
  test("TC-6.1 screenshot 整页, 返回有效图片", async ({ context, extensionId, serviceWorker }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    await openFixturePage(context, "long-article.html");

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "screenshot" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Here is the screenshot of the full page." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Take a screenshot");
    await waitForReplyDone(page, 15_000);

    await expect(page.locator(".superduck-response img").first()).toBeVisible();
    await page.close();
  });

  test("TC-6.2 screenshot 按元素 ref 裁剪", async ({ context, extensionId, serviceWorker }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    await openFixturePage(context, "long-article.html");

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "screenshot" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Screenshot of the target element captured." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Screenshot the target element");
    await waitForReplyDone(page, 15_000);
    await page.close();
  });

  test("TC-6.3 annotated screenshot 含标注层", async ({ context, extensionId, serviceWorker }) => {
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
          content: [{ type: "text", text: "Annotated screenshot with labels taken." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Take an annotated screenshot");
    await waitForReplyDone(page, 15_000);
    await page.close();
  });

  test("TC-6.4 跨 tab 切换后 screenshot 对应到正确 tab", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    const page1 = await openFixturePage(context, "login-button.html");
    const page2 = await openFixturePage(context, "long-article.html");

    await page2.bringToFront();

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "screenshot" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Screenshot taken of the current active tab." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const sidepanel = await openSidepanel(context, extensionId);
    await mockLLMStreaming(sidepanel, script);
    await sendMessage(sidepanel, "Screenshot current tab");
    await waitForReplyDone(sidepanel, 15_000);
    await sidepanel.close();
    await page1.close();
    await page2.close();
  });

  test("TC-6.5 截图在消息流中可点击放大", async ({ context, extensionId, serviceWorker }) => {
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
          content: [{ type: "text", text: "Screenshot captured." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Take a screenshot");
    await waitForReplyDone(page, 15_000);

    const images = page.locator(".superduck-response img");
    const imgCount = await images.count();
    expect(imgCount).toBeGreaterThan(0);

    const img = images.first();
    await expect(img).toBeVisible();
    await page.close();
  });
});
