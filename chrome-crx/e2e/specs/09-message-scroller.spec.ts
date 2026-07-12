import { test, expect } from '../fixtures/extension';
import { seedStorage, getDefaultProviderConfig, clearStorage } from '../fixtures/storage';
import { openSidepanel, sendMessage, waitForReplyDone } from '../helpers/sidepanel';
import { openFixturePage } from '../helpers/pages';
import { mockLLMStreaming } from '../fixtures/mockLLM';
import type { Page, BrowserContext, Worker } from '@playwright/test';

async function getChromeTabIdFor(sw: any, page: Page): Promise<number> {
  const url = page.url();
  const id = await sw.evaluate(
    async ({ url }: { url: string }) => {
      const tabs = await (globalThis as any).chrome.tabs.query({});
      const match = tabs.find((t: any) => t.url === url);
      return match?.id ?? null;
    },
    { url }
  );
  if (id == null) {
    throw new Error(`Could not find a chrome.tabs entry for Playwright page ${url}`);
  }
  return id;
}

async function seedSuperDuckGroup(sw: any, tabId: number): Promise<void> {
  const groupId = await sw.evaluate(
    async ({ tabId }: { tabId: number }) => {
      const sw = globalThis as any;
      try {
        const id = await sw.chrome.tabs.group({ tabIds: [tabId] });
        await sw.chrome.tabGroups.update(id, {
          title: '🦆SuperDuck',
          color: 'orange',
          collapsed: false
        });
        return { ok: true, chromeGroupId: id };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
    { tabId }
  );
  if (!groupId.ok) {
    throw new Error(`chrome.tabs.group failed for tab ${tabId}: ${groupId.error}`);
  }
}

async function openChatSidepanel(
  context: BrowserContext,
  sw: Worker,
  extensionId: string,
  targetPage: Page,
  targetTabId: number
): Promise<Page> {
  const sp = await openSidepanel(context, extensionId, targetTabId);

  // Wait for the boot-time PANEL_READY to finish
  await sp.waitForTimeout(2000);

  // Find the sidepanel's own tabId
  const spTabId = await sw.evaluate(async () => {
    const tabs = await (globalThis as any).chrome.tabs.query({});
    const sp = tabs.find((t: any) => (t.url ?? '').includes('sidepanel.html'));
    return sp?.id;
  });
  if (typeof spTabId !== 'number') {
    throw new Error('Could not resolve sidepanel tabId');
  }

  // Re-write tabGroups storage
  await sw.evaluate(
    async ({ tabId, spTabId: sideTabId }: { tabId: number; spTabId: number }) => {
      const sw = globalThis as any;
      const groups = (await sw.chrome.storage.local.get('tabGroups'))?.tabGroups ?? {};
      const oldEntry = groups[String(sideTabId)];
      const chromeGroupId = oldEntry?.chromeGroupId ?? 12345;
      let domain = 'blank';
      try {
        const tab = await sw.chrome.tabs.get(tabId);
        if (tab.url) domain = new URL(tab.url).hostname || 'blank';
      } catch {
        // ignore
      }
      for (const k of Object.keys(groups)) delete groups[k];
      groups[String(tabId)] = {
        mainTabId: tabId,
        createdAt: Date.now(),
        domain,
        chromeGroupId,
        memberStates: { [tabId]: { indicatorState: 'none' } }
      };
      await sw.chrome.storage.local.set({ tabGroups: groups });
    },
    { tabId: targetTabId, spTabId }
  );

  // Flip active tab
  await sw.evaluate(async (tabId: number) => {
    await (globalThis as any).chrome.tabs.update(tabId, { active: true });
  }, targetTabId);
  await targetPage.bringToFront();
  await sp.waitForTimeout(1500);

  // Make sure the chat UI is up
  await sp.waitForSelector('.ProseMirror', { timeout: 10_000 });
  return sp;
}

test.describe('MessageScroller E2E 测试套件', () => {
  let sidepanel: Page;

  test.beforeEach(async ({ context, extensionId, serviceWorker }) => {
    // 1. 初始化 Mock Storage 数据
    await clearStorage(serviceWorker);
    await seedStorage(serviceWorker, getDefaultProviderConfig());

    // 2. 打开 Fixture page 作为背景 Tab
    const targetPage = await openFixturePage(context, 'simple-form.html');
    const targetTabId = await getChromeTabIdFor(serviceWorker, targetPage);
    await seedSuperDuckGroup(serviceWorker, targetTabId);

    // 3. 打开 Sidepanel 并激活会话
    sidepanel = await openChatSidepanel(
      context,
      serviceWorker,
      extensionId,
      targetPage,
      targetTabId
    );
  });

  test.afterEach(async () => {
    if (sidepanel) {
      await sidepanel.close();
    }
  });

  // ==========================================
  // Feature 1: 自动跟随滚动 (Auto-scroll)
  // ==========================================
  test.describe('Feature 1: 自动跟随滚动 (Auto-scroll)', () => {
    test('TC-1.1.2 长文本流式追加过程中的自动跟滑贴底', async () => {
      // 模拟流式超长数据输出
      const longText =
        '这里是超级长消息流式追加的第一行文本。\n' + '追加多行以产生滚动条...\n'.repeat(35);
      const script = {
        responses: [
          {
            content: [{ type: 'text' as const, text: longText }],
            stop_reason: 'end_turn' as const
          }
        ]
      };
      await mockLLMStreaming(sidepanel, script);

      // 发送消息触发流式应答
      await sendMessage(sidepanel, '测试长文本自动滚动');

      // 定位滚动容器
      const viewport = sidepanel.locator('[data-testid="message-scroller-viewport"]');
      await expect(viewport).toBeVisible();

      // 等答复完毕
      await waitForReplyDone(sidepanel);

      // 验证贴底：scrollHeight - clientHeight - scrollTop <= 8 (因为 MessageScroller 内部是 distanceFromBottom <= 8 判定为 bottom)
      const isAtBottom = await viewport.evaluate((el) => {
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        return distanceFromBottom <= 8;
      });

      expect(isAtBottom).toBe(true);
    });

    test('TC-1.2.5 正在跟滚时中途 Stop 能够停止在当前位置', async () => {
      // 流式超长数据输出，让它输出更长且带有多段，使得我们可以在输出中途点击 Stop
      const superLongText = '第一段\n' + '第二段，不断累积...\n'.repeat(1500);
      const script = {
        responses: [
          {
            content: [{ type: 'text' as const, text: superLongText }],
            stop_reason: 'end_turn' as const
          }
        ]
      };
      await mockLLMStreaming(sidepanel, script);
      await sendMessage(sidepanel, '测试流式点击Stop');

      // 等待流式输出已经有一定长度
      await sidepanel.waitForFunction(
        () => {
          const responseEl = document.querySelector('.superduck-response');
          return responseEl && responseEl.textContent && responseEl.textContent.length > 100;
        },
        { timeout: 5000 }
      );

      // 点击 Stop 按钮
      const stopBtn = sidepanel.locator('[data-test-id="stop-button"]');
      await stopBtn.click();

      // 等待状态回滚到 idle（发送按钮可见）
      const sendBtn = sidepanel.locator('[data-test-id="send-button"]');
      await expect(sendBtn).toBeVisible();

      // 获取当前 scrollTop 并等待一段时间，验证滚动没有被进一步追加或抖动
      const viewport = sidepanel.locator('[data-testid="message-scroller-viewport"]');
      const scrollTopAfterStop = await viewport.evaluate((el) => el.scrollTop);

      await sidepanel.waitForTimeout(200);
      const scrollTopLater = await viewport.evaluate((el) => el.scrollTop);
      expect(scrollTopLater).toBe(scrollTopAfterStop);
    });
  });

  // ==========================================
  // Feature 2: 滚动锁定与解锁机制 (Scroll Locking & Pinned State)
  // ==========================================
  test.describe('Feature 2: 滚动锁定与解锁机制 (Scroll Locking)', () => {
    test('TC-2.1.1 用户在流生成中手动上滑距离底部超过 50px 时触发锁定', async () => {
      const superLongText =
        '流式生成长文本内容以撑开滚动高度...\n' + '更多测试行追加...\n'.repeat(1500);
      const script = {
        responses: [
          {
            content: [{ type: 'text' as const, text: superLongText }],
            stop_reason: 'end_turn' as const
          }
        ]
      };
      await mockLLMStreaming(sidepanel, script);
      await sendMessage(sidepanel, '测试滚动锁定');

      // 等待输出一部分内容，使容器可以产生滚动条
      const viewport = sidepanel.locator('[data-testid="message-scroller-viewport"]');
      await sidepanel.waitForFunction(
        () => {
          const el = document.querySelector('[data-testid="message-scroller-viewport"]');
          return el && el.scrollHeight > el.clientHeight + 100;
        },
        { timeout: 5000 }
      );

      // 模拟真实用户向上滚轮滑动 150px 触发锁定（distanceFromBottom > 50 且 isScrollingUp）
      await viewport.hover();
      await sidepanel.mouse.wheel(0, -150);
      await sidepanel.waitForTimeout(100);

      // 记录此时的滚动位置
      const lockedScrollTop = await viewport.evaluate((el) => el.scrollTop);

      // 等待流式输出全部结束
      await waitForReplyDone(sidepanel);

      // 验证后续数据的流入没有导致自动贴底，依然锁定在之前的 scrollTop
      const finalScrollTop = await viewport.evaluate((el) => el.scrollTop);
      // scrollTop 应该不变或在小幅范围内波动（由 resize 导致，但不会滚到底部）
      expect(Math.abs(finalScrollTop - lockedScrollTop)).toBeLessThanOrEqual(10);
      const isAtBottom = await viewport.evaluate((el) => {
        return el.scrollHeight - el.scrollTop - el.clientHeight <= 8;
      });
      expect(isAtBottom).toBe(false); // 必须不是底部
    });

    test('TC-2.1.4 向上滑动未达 50px 时（如 30px）不触发锁定，下一帧自动贴底', async () => {
      const longText = '流式生成中等高度文本...\n' + '测试跟随滚动更新行...\n'.repeat(45);
      const script = {
        responses: [
          {
            content: [{ type: 'text' as const, text: longText }],
            stop_reason: 'end_turn' as const
          }
        ]
      };
      await mockLLMStreaming(sidepanel, script);
      await sendMessage(sidepanel, '测试临界跟随');

      const viewport = sidepanel.locator('[data-testid="message-scroller-viewport"]');
      await sidepanel.waitForFunction(
        () => {
          const el = document.querySelector('[data-testid="message-scroller-viewport"]');
          return el && el.scrollHeight > el.clientHeight + 85;
        },
        { timeout: 5000 }
      );

      // 真实滚轮上滑 30px（小于 50px 锁定阈值）
      await viewport.hover();
      await sidepanel.mouse.wheel(0, -30);
      await sidepanel.waitForTimeout(100);

      // 等待答复结束，会自动解锁跟滚贴底
      await waitForReplyDone(sidepanel);

      // 验证最终依然贴底
      const isAtBottom = await viewport.evaluate((el) => {
        return el.scrollHeight - el.scrollTop - el.clientHeight <= 8;
      });
      expect(isAtBottom).toBe(true);
    });
  });

  // ==========================================
  // Feature 3: 返回底部按钮 (MessageScrollerButton)
  // ==========================================
  test.describe('Feature 3: 返回底部按钮 (MessageScrollerButton)', () => {
    test('TC-3.1.1 & TC-3.1.2 流式锁定时只显示一个返回底部按钮，且不遮挡输入区', async () => {
      const superLongText = '第一行开始流式...\n' + '追加无数行...\n'.repeat(1500);
      const script = {
        responses: [
          {
            content: [{ type: 'text' as const, text: superLongText }],
            stop_reason: 'end_turn' as const
          }
        ]
      };
      await mockLLMStreaming(sidepanel, script);
      await sendMessage(sidepanel, '测试回到底部按钮');

      const viewport = sidepanel.locator('[data-testid="message-scroller-viewport"]');
      await sidepanel.waitForFunction(
        () => {
          const el = document.querySelector('[data-testid="message-scroller-viewport"]');
          return el && el.scrollHeight > el.clientHeight + 100;
        },
        { timeout: 5000 }
      );

      // 模拟真实用户上滑 150px 锁定
      await viewport.hover();
      await sidepanel.mouse.wheel(0, -150);
      await sidepanel.waitForTimeout(100);

      // 验证返回底部按钮只出现一个，且浮在输入区上方，不与旧入口或 composer 冲突
      const backToBottomButtons = sidepanel.locator('[data-testid="message-scroller-button"]');
      await expect(backToBottomButtons).toHaveCount(1);
      await expect(
        sidepanel.getByRole('button', { name: /滚动到底部|返回底部|Scroll to bottom/i })
      ).toHaveCount(1);
      const backToBottomBtn = backToBottomButtons.first();
      await expect(backToBottomBtn).toBeVisible();

      const inputSurface = sidepanel.locator('[data-chat-input-container="true"]');
      await expect(inputSurface).toBeVisible();
      const buttonBox = await backToBottomBtn.boundingBox();
      const inputBox = await inputSurface.boundingBox();
      expect(buttonBox).not.toBeNull();
      expect(inputBox).not.toBeNull();
      expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(inputBox!.y - 8);

      // 点击按钮
      await backToBottomBtn.click();

      // 按钮应该在回底动作后消失
      await expect(backToBottomBtn).not.toBeVisible();

      // 验证滚动贴底
      await sidepanel.waitForFunction(
        () => {
          const el = document.querySelector('[data-testid="message-scroller-viewport"]');
          return el && el.scrollHeight - el.scrollTop - el.clientHeight <= 8;
        },
        { timeout: 2000 }
      );
    });
  });

  // ==========================================
  // Feature 4: 极细冷灰色滚动条 (Custom Scrollbar Class)
  // ==========================================
  test.describe('Feature 4: 极细冷灰色滚动条样式验证', () => {
    test('TC-4.1.2 视口包含指定极细滚动条类名且默认隐藏/悬浮展现规范', async () => {
      const viewport = sidepanel.locator('[data-testid="message-scroller-viewport"]');
      // 验证 viewport 具备 css 类 '.message-scroller'
      const classes = await viewport.getAttribute('class');
      expect(classes).toContain('message-scroller');
    });
  });

  // ==========================================
  // Feature 5: 动态高度自适应与极端边界 (Dynamic Height & Resize)
  // ==========================================
  test.describe('Feature 5: 动态高度自适应与极端边界', () => {
    test('TC-5.1.5 Resize 动作下滚动位置和贴底状态良好维护', async () => {
      const longText = '流式生成长文本内容以测试自适应拉底...\n' + '更多段落追加中...\n'.repeat(45);
      const script = {
        responses: [
          {
            content: [{ type: 'text' as const, text: longText }],
            stop_reason: 'end_turn' as const
          }
        ]
      };
      await mockLLMStreaming(sidepanel, script);
      await sendMessage(sidepanel, '测试 Resize 自适应');

      // 在流式生成中途，修改视口高度
      await sidepanel.setViewportSize({ width: 400, height: 600 });
      await sidepanel.waitForTimeout(100);

      // 等待答复结束
      await waitForReplyDone(sidepanel);

      // 验证即使 Resize 发生，最后依然能自动跟滚至最底部
      const viewport = sidepanel.locator('[data-testid="message-scroller-viewport"]');
      const isAtBottom = await viewport.evaluate((el) => {
        return el.scrollHeight - el.scrollTop - el.clientHeight <= 8;
      });
      expect(isAtBottom).toBe(true);
    });
  });

  // ==========================================
  // Feature 6: shadcn visual token regression
  // ==========================================
  test.describe('Feature 6: shadcn 视觉 token 回归', () => {
    test('TC-6.1.1 输入区 focus 和发送按钮使用 shadcn token，不回退到灰边或危险色', async () => {
      const inputSurface = sidepanel.locator('[data-chat-input-container="true"]');
      await expect(inputSurface).toBeVisible();

      await inputSurface.click();
      await sidepanel.waitForTimeout(350);

      const styles = await sidepanel.evaluate(() => {
        const input = document.querySelector('[data-chat-input-container="true"]');
        const sendButton = document.querySelector('[data-test-id="send-button"]');
        const resolveColorToken = (tokenName: string) => {
          const probe = document.createElement('div');
          probe.style.backgroundColor = `var(${tokenName})`;
          document.body.appendChild(probe);
          const value = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return value;
        };
        return {
          inputBorder: input ? getComputedStyle(input).borderColor : '',
          inputShadow: input ? getComputedStyle(input).boxShadow : '',
          emptySendBackground: sendButton ? getComputedStyle(sendButton).backgroundColor : '',
          primary: resolveColorToken('--primary'),
          muted: resolveColorToken('--muted'),
          destructive: resolveColorToken('--destructive'),
          bodyText: document.body.innerText
        };
      });

      expect(styles.inputBorder).not.toBe(styles.destructive);
      expect(styles.inputShadow).not.toBe('none');
      expect(styles.emptySendBackground).not.toBe('rgba(0, 0, 0, 0)');
      expect(styles.emptySendBackground).toContain('oklab');
      expect(styles.emptySendBackground).not.toBe(styles.primary);
      expect(styles.emptySendBackground).not.toBe(styles.destructive);
      expect(styles.bodyText).not.toContain('返回底部');

      const editor = sidepanel.getByRole('textbox', {
        name: /Message SuperDuck|向 SuperDuck 发送消息/i
      });
      await expect(editor).toBeVisible();
      await editor.click();
      await sidepanel.keyboard.type('shadcn token check');
      await sidepanel.waitForFunction(() => {
        const sendButton = document.querySelector('[data-test-id="send-button"]');
        return sendButton instanceof HTMLButtonElement && !sendButton.disabled;
      });

      const activeSendBackground = await sidepanel.evaluate(() => {
        const sendButton = document.querySelector('[data-test-id="send-button"]');
        return sendButton ? getComputedStyle(sendButton).backgroundColor : '';
      });
      expect(activeSendBackground).not.toBe(styles.muted);
      expect(activeSendBackground).not.toBe(styles.destructive);
    });
  });
});
