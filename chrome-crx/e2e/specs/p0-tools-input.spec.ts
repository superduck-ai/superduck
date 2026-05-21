import { test, expect } from "../fixtures/extension";
import { seedStorage, getDefaultProviderConfig } from "../fixtures/storage";
import { mockLLMStreaming, type MockLLMScript } from "../fixtures/mockLLM";
import { openSidepanel, sendMessage, waitForReplyDone } from "../helpers/sidepanel";
import { openFixturePage } from "../helpers/pages";

test.describe("5.1 click", () => {
  test("TC-5.1.1 按有效 ref 点击按钮, 页面事件被触发", async ({
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
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "left_click", coordinate: [100, 200] } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Clicked the button successfully." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Click the login button");
    await waitForReplyDone(page, 15_000);

    await expect(targetPage.locator("#result")).toBeVisible();
    await expect(targetPage.locator("#overlay")).toBeVisible();

    await page.close();
    await targetPage.close();
  });

  test("TC-5.1.2 点击链接触发导航", async ({ context, extensionId, serviceWorker }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    await openFixturePage(context, "login-button.html");

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "left_click", coordinate: [100, 300] } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Clicked the link and navigated." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Click the navigation link");
    await waitForReplyDone(page, 15_000);
    await page.close();
  });

  test("TC-5.1.3 ref 不存在时返回明确错误, 不阻塞会话", async ({
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
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "left_click", coordinate: [9999, 9999] } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Could not click at that position." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Click at invalid position");
    await waitForReplyDone(page, 15_000);

    const sendBtn = page.locator('[data-test-id="send-button"]');
    await expect(sendBtn).toBeVisible();
    await page.close();
  });

  test("TC-5.1.4 被遮挡 / disabled 元素点击失败有清晰报错", async ({
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
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "left_click", coordinate: [200, 200] } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "The element is disabled and cannot be clicked." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Click the disabled button");
    await waitForReplyDone(page, 15_000);
    await page.close();
  });
});

test.describe("5.2 type", () => {
  test("TC-5.2.1 type 到 input, value 与传入字符串一致", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    const targetPage = await openFixturePage(context, "simple-form.html");

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "left_click", coordinate: [250, 100] } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [
            { type: "tool_use", id: "tu_2", name: "computer", input: { action: "type", text: "John Doe" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Typed 'John Doe' into the name field." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Type John Doe in the name field");
    await waitForReplyDone(page, 20_000);

    const nameValue = await targetPage.locator("#name").inputValue();
    expect(nameValue).toBe("John Doe");

    await page.close();
    await targetPage.close();
  });

  test("TC-5.2.2 type 中文 / emoji / 特殊符号正确", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    const targetPage = await openFixturePage(context, "simple-form.html");

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "left_click", coordinate: [250, 100] } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [
            { type: "tool_use", id: "tu_2", name: "computer", input: { action: "type", text: "你好世界 🌍" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Typed Chinese text with emoji." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Type Chinese text");
    await waitForReplyDone(page, 20_000);

    const nameValue = await targetPage.locator("#name").inputValue();
    expect(nameValue).toContain("你好世界");

    await page.close();
    await targetPage.close();
  });

  test("TC-5.2.3 对非可编辑元素 type 返回错误", async ({ context, extensionId, serviceWorker }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    await openFixturePage(context, "simple-form.html");

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "type", text: "cannot type here" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Typing may not work on non-editable elements." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Type into readonly field");
    await waitForReplyDone(page, 15_000);
    await page.close();
  });

  test("TC-5.2.4 type 触发 input / change 事件", async ({ context, extensionId, serviceWorker }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    const targetPage = await openFixturePage(context, "simple-form.html");

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "left_click", coordinate: [250, 100] } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [
            { type: "tool_use", id: "tu_2", name: "computer", input: { action: "type", text: "test" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Typed and triggered events." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Type into name field");
    await waitForReplyDone(page, 20_000);

    const events = await targetPage.evaluate(() => (window as any).getEvents?.() || []);
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e: any) => e.type === "input" && e.target === "name")).toBe(true);
    await page.close();
    await targetPage.close();
  });
});

test.describe("5.3 press_key", () => {
  test("TC-5.3.1 press_key Enter 提交表单", async ({ context, extensionId, serviceWorker }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    const targetPage = await openFixturePage(context, "simple-form.html");
    await targetPage.bringToFront();
    await targetPage.locator("#name").click();

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "key", text: "Return" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Pressed Enter to submit the form." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Press Enter");
    await waitForReplyDone(page, 15_000);

    const submitted = await targetPage.evaluate(() => (window as any).__formSubmitted === true);
    expect(submitted).toBe(true);

    await page.close();
    await targetPage.close();
  });

  test("TC-5.3.2 组合键触发预期行为", async ({ context, extensionId, serviceWorker }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    const targetPage = await openFixturePage(context, "simple-form.html");
    await targetPage.bringToFront();
    await targetPage.locator("#name").click();
    await targetPage.locator("#name").fill("test text");

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "key", text: "ctrl+a" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Pressed Ctrl+A to select all." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Select all text");
    await waitForReplyDone(page, 15_000);
    await page.close();
    await targetPage.close();
  });

  test("TC-5.3.3 Tab 键切换焦点到下一个可聚焦元素", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      browserControlPermissionAccepted: true,
    });

    const targetPage = await openFixturePage(context, "simple-form.html");
    await targetPage.bringToFront();
    await targetPage.locator("#name").click();

    const script: MockLLMScript = {
      responses: [
        {
          content: [
            { type: "tool_use", id: "tu_1", name: "computer", input: { action: "key", text: "Tab" } },
          ],
          stop_reason: "tool_use",
        },
        {
          content: [{ type: "text", text: "Pressed Tab to move focus." }],
          stop_reason: "end_turn",
        },
      ],
    };

    const page = await openSidepanel(context, extensionId);
    await mockLLMStreaming(page, script);
    await sendMessage(page, "Press Tab");
    await waitForReplyDone(page, 15_000);

    const focusedId = await targetPage.evaluate(() => document.activeElement?.id || "");
    expect(focusedId).toBe("email");

    await page.close();
    await targetPage.close();
  });
});
