import { test, expect } from '../fixtures/extension';
import { seedStorage, getDefaultProviderConfig } from '../fixtures/storage';
import { getActiveTabId, openSidepanel } from '../helpers/sidepanel';

// Clicking the "Teach SuperDuck" button (CursorClickIcon in the input toolbar)
// must open the WorkflowModeSelectionModal. The modal is mounted by ModalsLayer
// when `showWorkflowModeSelectionModal` flips to true; we assert the modal
// renders (not just an empty shell) and that the close button dismisses it.

test.describe('Sidepanel input toolbar → Teach SuperDuck button', () => {
  test('clicking the Teach SuperDuck button opens the workflow mode selection modal', async ({
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

    const teachButton = sidepanel.locator('[data-test-id="teach-superduck-button"]');
    await teachButton.waitFor({ state: 'visible', timeout: 10_000 });
    await teachButton.click();

    const modal = sidepanel.locator('[data-test-id="workflow-mode-selection-modal"]');
    await expect(modal).toBeVisible();
    // Header close button proves the full modal rendered, not an empty shell.
    await expect(modal.locator('[data-test-id="workflow-mode-close-button"]')).toBeVisible();

    // Dismissing via the close button tears the modal down.
    await modal.locator('[data-test-id="workflow-mode-close-button"]').click();
    await expect(modal).toHaveCount(0);

    await sidepanel.close();
    await targetPage.close();
  });

  test('slow clicking the Teach SuperDuck button opens the workflow mode selection modal', async ({
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

    const teachButton = sidepanel.locator('[data-test-id="teach-superduck-button"]');
    await teachButton.waitFor({ state: 'visible', timeout: 10_000 });
    await teachButton.click({ delay: 80 });

    const modal = sidepanel.locator('[data-test-id="workflow-mode-selection-modal"]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('[data-test-id="workflow-mode-close-button"]')).toBeVisible();

    await sidepanel.close();
    await targetPage.close();
  });
});
