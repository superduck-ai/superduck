import { test, expect } from "../fixtures/extension";
import { seedStorage, getDefaultProviderConfig } from "../fixtures/storage";
import { mockLLMStreaming, type MockLLMScript } from "../fixtures/mockLLM";
import { openSidepanel, sendMessage, waitForReplyDone } from "../helpers/sidepanel";
import { openFixturePage } from "../helpers/pages";

test.describe("8. 端到端集成场景", () => {
  test.describe("场景 A — 帮我点登录按钮", () => {
    test("TC-8.A.1-5 完整流程: sidepanel 提问 → 工具调用序列 → 页面效果 → 确认", async ({
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
              { type: "tool_use", id: "tu_1", name: "read_page", input: { reason: "find login button" } },
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
            content: [{ type: "text", text: "已点击登录按钮，页面显示登录对话框。" }],
            stop_reason: "end_turn",
          },
        ],
      };

      const sidepanel = await openSidepanel(context, extensionId);
      await mockLLMStreaming(sidepanel, script);

      await sendMessage(sidepanel, "帮我点登录按钮");
      await waitForReplyDone(sidepanel, 20_000);

      const response = await sidepanel.locator(".superduck-response").last().textContent();
      expect(response).toContain("登录");

      await expect(targetPage.locator("#result")).toBeVisible();
      await expect(targetPage.locator("#overlay")).toHaveClass(/show/);

      await sidepanel.close();
      await targetPage.close();
    });
  });

  test.describe("场景 B — 截图并总结当前页内容", () => {
    test("TC-8.B.1-5 完整流程: 打开长文页 → 截图 → 总结 → markdown 渲染", async ({
      context,
      extensionId,
      serviceWorker,
    }) => {
      await seedStorage(serviceWorker, {
        ...getDefaultProviderConfig(),
        browserControlPermissionAccepted: true,
      });

      const targetPage = await openFixturePage(context, "long-article.html");

      const script: MockLLMScript = {
        responses: [
          {
            content: [
              { type: "tool_use", id: "tu_1", name: "computer", input: { action: "screenshot" } },
            ],
            stop_reason: "tool_use",
          },
          {
            content: [
              {
                type: "text",
                text: "## 页面总结\n\n这篇文章讨论了人工智能的未来：\n\n- **机器学习突破**：深度学习和transformer架构的进展\n- **伦理考量**：偏见、隐私和问责制\n- **未来展望**：多模态AI与量子计算的结合\n\n文章全面概述了AI技术的现状和发展方向。",
              },
            ],
            stop_reason: "end_turn",
          },
        ],
      };

      const sidepanel = await openSidepanel(context, extensionId);
      await mockLLMStreaming(sidepanel, script);

      await sendMessage(sidepanel, "总结这页内容");
      await waitForReplyDone(sidepanel, 20_000);

      const response = sidepanel.locator(".superduck-response").last();
      const headings = response.locator("h2");
      const lists = response.locator("li");

      expect(await headings.count()).toBeGreaterThanOrEqual(1);
      expect(await lists.count()).toBeGreaterThanOrEqual(2);

      const text = await response.textContent();
      expect(text).toContain("人工智能");

      await sidepanel.close();
      await targetPage.close();
    });
  });
});
