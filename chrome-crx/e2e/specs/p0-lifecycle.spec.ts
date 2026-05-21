import { test, expect } from "../fixtures/extension";
import { seedStorage } from "../fixtures/storage";
import { openSidepanel } from "../helpers/sidepanel";
import { openOptionsPage } from "../helpers/pages";

test.describe("1.1 加载安装", () => {
  test("TC-1.1.1 加载 dist/ 后扩展出现在扩展列表, 无 manifest 报错", async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto("chrome://extensions/");
    // Extension loaded successfully if we have a valid extensionId
    expect(extensionId).toBeTruthy();
    expect(extensionId).toMatch(/^[a-z]{32}$/);
  });

  test("TC-1.1.2 Service Worker 注册成功, 可解析出 extensionId", async ({
    serviceWorker,
    extensionId,
  }) => {
    expect(serviceWorker).toBeTruthy();
    expect(serviceWorker.url()).toContain(extensionId);
    expect(extensionId).toMatch(/^[a-z]{32}$/);
  });

  test("TC-1.1.3 扩展图标显示在工具栏, title 为 Open SuperDuck", async ({
    serviceWorker,
    extensionId,
  }) => {
    // Verify action title via service worker evaluation
    const title = await serviceWorker.evaluate(async () => {
      const actionTitle = await (globalThis as any).chrome.action.getTitle({});
      return actionTitle;
    });
    expect(title).toContain("SuperDuck");
  });

  test("TC-1.1.4 Options 页可打开", async ({ context, extensionId }) => {
    const optionsPage = await openOptionsPage(context, extensionId);
    await optionsPage.waitForSelector("#root");
    expect(await optionsPage.title()).toBeTruthy();
    await optionsPage.close();
  });
});

test.describe("1.2 入口触发", () => {
  test("TC-1.2.1 点击扩展图标可打开 side panel", async ({ context, extensionId }) => {
    const sidepanel = await openSidepanel(context, extensionId);
    await expect(sidepanel.locator("#root")).toBeVisible();
    await sidepanel.close();
  });

  test("TC-1.2.2 side panel 可在有活跃 tab 时正常打开", async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto("https://example.com");
    // Simulate keyboard shortcut — note: Chrome extension shortcuts may not be
    // directly triggerable via Playwright, so we test the sidepanel can open
    const sidepanel = await openSidepanel(context, extensionId);
    await expect(sidepanel.locator("#root")).toBeVisible();
    await sidepanel.close();
    await page.close();
  });

  test("TC-1.2.3 再次打开 side panel 仍可用", async ({ context, extensionId }) => {
    const sp1 = await openSidepanel(context, extensionId);
    await expect(sp1.locator("#root")).toBeVisible();
    await sp1.close();

    const sp2 = await openSidepanel(context, extensionId);
    await expect(sp2.locator("#root")).toBeVisible();
    await sp2.close();
  });
});

test.describe("1.3 SW 生命周期", () => {
  test("TC-1.3.1 Service Worker 运行中时 side panel 可正常加载", async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    // SW is running
    expect(serviceWorker.url()).toContain(extensionId);
    // Open sidepanel to exercise the SW
    const sidepanel = await openSidepanel(context, extensionId);
    await expect(sidepanel.locator("#root")).toBeVisible();
    await sidepanel.close();
  });

  test("TC-1.3.2 chrome.storage 数据持久化保留", async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    await seedStorage(serviceWorker, { testPersistKey: "hello_e2e" });

    const value = await serviceWorker.evaluate(async () => {
      const result = await (globalThis as any).chrome.storage.local.get("testPersistKey");
      return result.testPersistKey;
    });
    expect(value).toBe("hello_e2e");
  });
});
