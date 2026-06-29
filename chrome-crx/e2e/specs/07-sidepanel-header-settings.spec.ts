import { test, expect, type Page } from '../fixtures/extension';
import { seedStorage, getDefaultProviderConfig } from '../fixtures/storage';
import { getActiveTabId, openSidepanel } from '../helpers/sidepanel';

// Regression: three-dots → Settings must open options.html. The slow-click
// case reproduces the docked timing bug (mousedown fired a null-ref
// click-outside that unmounted the button before mouseup landed).

test.describe('Sidepanel header menu → Settings', () => {
  const optionsBaseUrl = (extensionId: string) =>
    `chrome-extension://${extensionId}/options.html`;

  test('clicking three-dots → Settings opens the options page', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    await seedStorage(serviceWorker, getDefaultProviderConfig());

    const targetPage = await context.newPage();
    await targetPage.goto('https://example.com');
    await targetPage.bringToFront();

    const targetTabId = await getActiveTabId(serviceWorker);
    const sidepanel = await openSidepanel(context, extensionId, targetTabId);
    await expect(sidepanel.locator('#root')).toBeVisible();

    const menuToggle = sidepanel.locator('[data-test-id="header-menu-toggle"]');
    await menuToggle.click();

    const settingsItem = sidepanel.locator('[data-test-id="menu-item-settings"]');
    await expect(settingsItem).toBeVisible();
    await settingsItem.click();

    const baseUrl = optionsBaseUrl(extensionId);
    let optionsPage: Page | undefined;
    await expect
      .poll(
        async () => {
          optionsPage = context.pages().find((p) => p.url() === baseUrl);
          return !!optionsPage;
        },
        { timeout: 5000, intervals: [200, 500] }
      )
      .toBeTruthy();

    await sidepanel.close();
    await targetPage.close();
    await optionsPage!.close();
  });

  test('slow click on Settings still opens options page (reproduces docked timing bug)', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    await seedStorage(serviceWorker, getDefaultProviderConfig());

    const targetPage = await context.newPage();
    await targetPage.goto('https://example.com');
    await targetPage.bringToFront();

    const targetTabId = await getActiveTabId(serviceWorker);
    const sidepanel = await openSidepanel(context, extensionId, targetTabId);
    await expect(sidepanel.locator('#root')).toBeVisible();

    const menuToggle = sidepanel.locator('[data-test-id="header-menu-toggle"]');
    await menuToggle.click();

    const settingsItem = sidepanel.locator('[data-test-id="menu-item-settings"]');
    await expect(settingsItem).toBeVisible();

    // Slow click reproduces the docked bug: before the fix, mousedown fired
    // the null-ref click-outside and unmounted the button before mouseup.
    const box = await settingsItem.boundingBox();
    expect(box).not.toBeNull();
    await sidepanel.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await sidepanel.mouse.down();
    await sidepanel.waitForTimeout(60);
    await sidepanel.mouse.up();

    const baseUrl = optionsBaseUrl(extensionId);
    let optionsPage: Page | undefined;
    await expect
      .poll(
        async () => {
          optionsPage = context.pages().find((p) => p.url() === baseUrl);
          return !!optionsPage;
        },
        { timeout: 5000, intervals: [200, 500] }
      )
      .toBeTruthy();

    await sidepanel.close();
    await targetPage.close();
    await optionsPage!.close();
  });
});
