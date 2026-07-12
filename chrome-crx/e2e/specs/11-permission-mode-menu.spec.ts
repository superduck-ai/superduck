import { test, expect } from '../fixtures/extension';
import { getDefaultProviderConfig, seedStorage } from '../fixtures/storage';
import { getActiveTabId, openSidepanel } from '../helpers/sidepanel';

test.describe('Sidepanel permission mode menu', () => {
  test('selects Request approval from the portaled menu', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    await seedStorage(serviceWorker, {
      ...getDefaultProviderConfig(),
      preferred_locale: 'zh-CN',
      lastPermissionModePreference: 'skip_all_permission_checks'
    });

    const targetPage = await context.newPage();
    await targetPage.goto('https://example.com');
    await targetPage.bringToFront();

    const targetTabId = await getActiveTabId(serviceWorker);
    const sidepanel = await openSidepanel(context, extensionId, targetTabId);
    const fullAccessTrigger = sidepanel.locator('[data-permission-mode="full-access"]');
    await expect(fullAccessTrigger).toBeVisible();
    const triggerStyle = await fullAccessTrigger.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        borderWidth: style.borderTopWidth,
        borderRadius: Number.parseFloat(style.borderTopLeftRadius),
        height: element.getBoundingClientRect().height
      };
    });
    expect(triggerStyle.borderWidth).toBe('0px');
    expect(triggerStyle.borderRadius).toBeLessThan(triggerStyle.height / 2);
    await fullAccessTrigger.click();

    const requestApprovalItem = sidepanel.getByRole('menuitemradio', { name: /请求批准/ });
    await expect(requestApprovalItem).toBeVisible();

    const itemBox = await requestApprovalItem.boundingBox();
    expect(itemBox).not.toBeNull();
    await sidepanel.mouse.move(itemBox!.x + itemBox!.width / 2, itemBox!.y + itemBox!.height / 2);
    await sidepanel.mouse.down();
    await sidepanel.waitForTimeout(60);
    await sidepanel.mouse.up();

    await expect(sidepanel.locator('[data-permission-mode="request-approval"]')).toBeVisible();
    await expect(requestApprovalItem).toBeHidden();

    await sidepanel.close();
    await targetPage.close();
  });
});
