import type { BrowserContext, Page, Worker } from '@playwright/test';
import { test, expect } from '../fixtures/extension';
import { seedStorage } from '../fixtures/storage';
import { requestExplicitSidePanelOpen } from '../helpers/sidepanel';

async function getTabForPage(serviceWorker: Worker, page: Page) {
  const url = page.url();
  return await serviceWorker.evaluate(async (targetUrl) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tabs = await (globalThis as any).chrome.tabs.query({});
    const tab = tabs.find((candidate: chrome.tabs.Tab) => candidate.url === targetUrl);
    if (!tab?.id || !tab.windowId) {
      throw new Error(`Could not find Chrome tab for ${targetUrl}`);
    }
    return { id: tab.id, windowId: tab.windowId };
  }, url);
}

async function openRealSidePanelForTab(
  context: BrowserContext,
  extensionId: string,
  tabId: number
): Promise<Page> {
  const controlPage = await context.newPage();
  await controlPage.goto(`chrome-extension://${extensionId}/options.html`);
  await controlPage.evaluate((targetTabId) => {
    const button = document.createElement('button');
    button.id = 'open-real-sidepanel';
    button.textContent = 'Open sidepanel';
    button.style.cssText =
      'position:fixed;top:10px;left:10px;width:160px;height:60px;z-index:999999';
    document.body.appendChild(button);
    button.addEventListener('click', async () => {
      void chrome.sidePanel.setOptions({
        tabId: targetTabId,
        path: 'sidepanel.html',
        enabled: true
      });
      try {
        await chrome.sidePanel.open({ tabId: targetTabId });
        (window as unknown as { __sidePanelOpened?: boolean }).__sidePanelOpened = true;
      } catch (err) {
        (window as unknown as { __sidePanelOpenError?: string }).__sidePanelOpenError =
          err instanceof Error ? err.message : String(err);
      }
    });
  }, tabId);
  await controlPage.click('#open-real-sidepanel', { force: true });
  await expect
    .poll(
      async () => {
        return await controlPage.evaluate(() => {
          const state = window as unknown as {
            __sidePanelOpened?: boolean;
            __sidePanelOpenError?: string;
          };
          if (state.__sidePanelOpenError) return state.__sidePanelOpenError;
          return state.__sidePanelOpened === true;
        });
      },
      { timeout: 5000, intervals: [100, 250, 500] }
    )
    .toBe(true);
  return controlPage;
}

async function getSidePanelDocumentIds(
  serviceWorker: Worker,
  extensionId: string
): Promise<string[]> {
  return await serviceWorker.evaluate(async (targetExtensionId) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runtime = (globalThis as any).chrome.runtime as {
      getContexts?: (filter: Record<string, unknown>) => Promise<
        Array<{
          contextId?: string;
          documentId?: string;
          documentUrl?: string;
        }>
      >;
    };

    if (typeof runtime.getContexts !== 'function') return [];

    const contexts = await runtime.getContexts({
      contextTypes: ['SIDE_PANEL']
    });
    return contexts
      .filter((context) =>
        context.documentUrl?.startsWith(`chrome-extension://${targetExtensionId}/sidepanel.html`)
      )
      .flatMap((context) => context.documentId ?? context.contextId ?? []);
  }, extensionId);
}

async function waitForSidePanelDocumentId(
  serviceWorker: Worker,
  extensionId: string
): Promise<string> {
  await expect
    .poll(async () => (await getSidePanelDocumentIds(serviceWorker, extensionId)).length, {
      timeout: 5000,
      intervals: [100, 250, 500]
    })
    .toBeGreaterThan(0);

  return (await getSidePanelDocumentIds(serviceWorker, extensionId))[0];
}

async function installSidePanelProbe(serviceWorker: Worker): Promise<void> {
  const installed = await serviceWorker.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sidePanel = (globalThis as any).chrome.sidePanel as {
      setOptions: (options: unknown) => Promise<void>;
      close?: (options?: unknown) => Promise<void>;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__sidePanelSetOptionsCalls = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__sidePanelCloseCalls = [];

    const originalSetOptions = sidePanel.setOptions.bind(sidePanel);
    const setOptionsProbe = async (options: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__sidePanelSetOptionsCalls.push(JSON.parse(JSON.stringify(options)));
      await originalSetOptions(options);
    };

    const closeProbe = async (options?: unknown) => {
      // Intentionally record only: this spec verifies whether production
      // code calls close(), without actually closing the panel under test.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__sidePanelCloseCalls.push(options ?? null);
    };

    try {
      sidePanel.setOptions = setOptionsProbe;
      sidePanel.close = closeProbe;
    } catch {
      try {
        Object.defineProperty(sidePanel, 'setOptions', {
          configurable: true,
          value: setOptionsProbe
        });
        Object.defineProperty(sidePanel, 'close', {
          configurable: true,
          value: closeProbe
        });
      } catch {
        return false;
      }
    }

    return sidePanel.setOptions === setOptionsProbe && sidePanel.close === closeProbe;
  });

  expect(installed, 'test setup should be able to instrument chrome.sidePanel').toBe(true);
}

async function getSetOptionsCalls(serviceWorker: Worker) {
  return await serviceWorker.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return [...((globalThis as any).__sidePanelSetOptionsCalls ?? [])];
  });
}

async function getCloseCalls(serviceWorker: Worker) {
  return await serviceWorker.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return [...((globalThis as any).__sidePanelCloseCalls ?? [])];
  });
}

async function installRuntimeProbe(serviceWorker: Worker): Promise<void> {
  await serviceWorker.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sw = globalThis as any;
    sw.__sidePanelRuntimeProbe = {
      panelReadyRecords: [],
      outgoingMessages: []
    };

    if (!sw.__sidePanelRuntimeProbeInstalled) {
      const runtime = chrome.runtime as typeof chrome.runtime & {
        sendMessage: (...args: unknown[]) => unknown;
      };
      const originalSendMessage = runtime.sendMessage.bind(chrome.runtime);
      sw.__sidePanelRuntimeOriginalSendMessage = originalSendMessage;
      runtime.sendMessage = (...args: unknown[]) => {
        sw.__sidePanelRuntimeProbe?.outgoingMessages.push(
          JSON.parse(JSON.stringify(args[0] ?? null))
        );
        return originalSendMessage(...args);
      };

      chrome.runtime.onMessage.addListener((message, sender) => {
        if (
          typeof message === 'object' &&
          message !== null &&
          (message as { type?: unknown }).type === 'PANEL_READY'
        ) {
          const record: {
            activeTabId?: number;
            senderUrl?: string;
            documentId?: string;
          } = {
            senderUrl: sender.url,
            documentId: (sender as { documentId?: string }).documentId
          };
          sw.__sidePanelRuntimeProbe?.panelReadyRecords.push(record);
          chrome.tabs
            .query({
              active: true,
              lastFocusedWindow: true
            })
            .then(([tab]) => {
              record.activeTabId = tab?.id;
            })
            .catch(() => {});
        }
        return false;
      });

      sw.__sidePanelRuntimeProbeInstalled = true;
    }
  });
}

async function getRuntimeProbe(serviceWorker: Worker): Promise<{
  panelReadyRecords: Array<{ activeTabId?: number; senderUrl?: string; documentId?: string }>;
  outgoingMessages: Array<Record<string, unknown> | null>;
}> {
  return await serviceWorker.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const probe = (globalThis as any).__sidePanelRuntimeProbe ?? {
      panelReadyRecords: [],
      outgoingMessages: []
    };
    return JSON.parse(JSON.stringify(probe));
  });
}

async function getTabSessionId(serviceWorker: Worker, tabId: number) {
  return await serviceWorker.evaluate(async (targetTabId) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (globalThis as any).chrome.storage.local.get(
      `sidepanel_tab_session_${targetTabId}`
    );
    return result[`sidepanel_tab_session_${targetTabId}`] as string | undefined;
  }, tabId);
}

async function getTabGroupMetadata(serviceWorker: Worker) {
  return await serviceWorker.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sw = globalThis as any;
    const storage = await sw.chrome.storage.local.get(null);
    return storage.tabGroups ?? {};
  });
}

async function createUnmanagedChromeTabGroup(serviceWorker: Worker, tabIds: number[]) {
  return await serviceWorker.evaluate(async (targetTabIds) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromeApi = (globalThis as any).chrome;
    const chromeGroupId = await chromeApi.tabs.group({ tabIds: targetTabIds });
    await chromeApi.tabGroups.update(chromeGroupId, {
      title: 'User workspace',
      color: chromeApi.tabGroups.Color.BLUE
    });
    return chromeGroupId as number;
  }, tabIds);
}

test.describe('sidepanel hides outside and restores inside the SuperDuck tab group', () => {
  test('e2e: tab activation disables only workspace tabs and never closes the sidepanel iframe', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    await seedStorage(serviceWorker, {
      aiProviderConfigVersion: 2,
      browserControlPermissionAccepted: true
    });

    const suffix = Date.now();
    const managedPage = await context.newPage();
    await managedPage.goto(`https://example.com/?superduck-managed=${suffix}`);
    const workspacePage = await context.newPage();
    await workspacePage.goto(`https://example.org/?user-workspace=${suffix}`);
    const workspaceSiblingPage = await context.newPage();
    await workspaceSiblingPage.goto(`https://example.net/?user-workspace-sibling=${suffix}`);

    const managedTab = await getTabForPage(serviceWorker, managedPage);
    const workspaceTab = await getTabForPage(serviceWorker, workspacePage);
    const workspaceSiblingTab = await getTabForPage(serviceWorker, workspaceSiblingPage);
    await createUnmanagedChromeTabGroup(serviceWorker, [workspaceTab.id, workspaceSiblingTab.id]);

    await requestExplicitSidePanelOpen(context, extensionId, managedTab.id);
    await expect
      .poll(
        async () => {
          return await serviceWorker.evaluate(async (tabId) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tab = await (globalThis as any).chrome.tabs.get(tabId);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return tab.groupId !== (globalThis as any).chrome.tabGroups.TAB_GROUP_ID_NONE;
          }, managedTab.id);
        },
        { timeout: 5000, intervals: [100, 250, 500] }
      )
      .toBe(true);

    await installSidePanelProbe(serviceWorker);

    await managedPage.bringToFront();
    await expect
      .poll(async () => await getSetOptionsCalls(serviceWorker), {
        timeout: 5000,
        intervals: [100, 250, 500]
      })
      .toContainEqual({
        tabId: managedTab.id,
        path: 'sidepanel.html',
        enabled: true
      });
    expect(await getCloseCalls(serviceWorker)).toHaveLength(0);

    await workspacePage.bringToFront();
    await expect
      .poll(async () => await getSetOptionsCalls(serviceWorker), {
        timeout: 5000,
        intervals: [100, 250, 500]
      })
      .toContainEqual({
        tabId: workspaceTab.id,
        enabled: false
      });
    await expect
      .poll(async () => await getSetOptionsCalls(serviceWorker), {
        timeout: 5000,
        intervals: [100, 250, 500]
      })
      .toContainEqual({
        tabId: workspaceSiblingTab.id,
        enabled: false
      });
    expect(await getCloseCalls(serviceWorker)).toHaveLength(0);

    await managedPage.bringToFront();
    await expect
      .poll(async () => await getSetOptionsCalls(serviceWorker), {
        timeout: 5000,
        intervals: [100, 250, 500]
      })
      .toContainEqual({
        tabId: managedTab.id,
        path: 'sidepanel.html',
        enabled: true
      });
    expect(await getCloseCalls(serviceWorker)).toHaveLength(0);

    await managedPage.close();
    await workspacePage.close();
    await workspaceSiblingPage.close();
  });

  test('e2e: real sidepanel does not retarget its UI session while hidden on a workspace tab', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    await serviceWorker.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (globalThis as any).chrome.storage.local.clear();
    });
    await seedStorage(serviceWorker, {
      aiProviderConfigVersion: 2,
      browserControlPermissionAccepted: true
    });

    const suffix = Date.now();
    const managedPage = await context.newPage();
    await managedPage.goto(`https://example.com/?superduck-managed-session=${suffix}`);
    const workspacePage = await context.newPage();
    await workspacePage.goto(`https://example.org/?user-workspace-session=${suffix}`);

    const managedTab = await getTabForPage(serviceWorker, managedPage);
    const workspaceTab = await getTabForPage(serviceWorker, workspacePage);
    const workspaceChromeGroupId = await createUnmanagedChromeTabGroup(serviceWorker, [
      workspaceTab.id
    ]);

    await installRuntimeProbe(serviceWorker);
    await requestExplicitSidePanelOpen(context, extensionId, managedTab.id);
    await expect
      .poll(
        async () => {
          return await serviceWorker.evaluate(async (tabId) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tab = await (globalThis as any).chrome.tabs.get(tabId);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return tab.groupId !== (globalThis as any).chrome.tabGroups.TAB_GROUP_ID_NONE;
          }, managedTab.id);
        },
        { timeout: 5000, intervals: [100, 250, 500] }
      )
      .toBe(true);

    const realSidePanelControlPage = await openRealSidePanelForTab(
      context,
      extensionId,
      managedTab.id
    );
    await managedPage.bringToFront();

    await expect
      .poll(async () => await getTabSessionId(serviceWorker, managedTab.id), {
        timeout: 8000,
        intervals: [100, 250, 500]
      })
      .toEqual(expect.any(String));
    const managedSessionId = await getTabSessionId(serviceWorker, managedTab.id);
    const sidePanelDocumentId = await waitForSidePanelDocumentId(serviceWorker, extensionId);
    await expect
      .poll(async () => (await getRuntimeProbe(serviceWorker)).panelReadyRecords.length, {
        timeout: 5000,
        intervals: [100, 250, 500]
      })
      .toBe(1);

    await workspacePage.bringToFront();
    // No positive event is expected here; give Chrome time to dispatch any
    // erroneous PANEL_READY or retarget messages before asserting absence.
    await workspacePage.waitForTimeout(3000);

    await expect
      .poll(async () => {
        return await serviceWorker.evaluate(async (tabId) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tab = await (globalThis as any).chrome.tabs.get(tabId);
          return tab.groupId as number;
        }, workspaceTab.id);
      })
      .toBe(workspaceChromeGroupId);
    expect(await getTabSessionId(serviceWorker, workspaceTab.id)).toBeUndefined();
    expect(Object.keys(await getTabGroupMetadata(serviceWorker))).not.toContain(
      String(workspaceTab.id)
    );
    expect(await getSidePanelDocumentIds(serviceWorker, extensionId)).toEqual([
      sidePanelDocumentId
    ]);
    const workspaceProbe = await getRuntimeProbe(serviceWorker);
    expect(workspaceProbe.panelReadyRecords).toHaveLength(1);
    expect(
      workspaceProbe.outgoingMessages.some(
        (message) =>
          message?.type === 'SIDE_PANEL_SET_ACTIVE_TAB' && message.tabId === workspaceTab.id
      )
    ).toBe(false);

    await managedPage.bringToFront();
    // The managed tab should restore the existing panel document without a new
    // PANEL_READY, so this bounded pause checks that no late reload arrives.
    await managedPage.waitForTimeout(1500);

    expect(await getTabSessionId(serviceWorker, managedTab.id)).toBe(managedSessionId);
    expect(await getTabSessionId(serviceWorker, workspaceTab.id)).toBeUndefined();
    expect(Object.keys(await getTabGroupMetadata(serviceWorker))).not.toContain(
      String(workspaceTab.id)
    );
    expect(await getSidePanelDocumentIds(serviceWorker, extensionId)).toEqual([
      sidePanelDocumentId
    ]);
    expect((await getRuntimeProbe(serviceWorker)).panelReadyRecords).toHaveLength(1);

    await managedPage.close();
    await workspacePage.close();
    await realSidePanelControlPage.close();
  });
});
