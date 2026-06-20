import { test, expect } from '../fixtures/extension';
import { seedStorage, getDefaultProviderConfig, clearStorage } from '../fixtures/storage';
import { openSidepanel, sendMessage, waitForAssistantMessage } from '../helpers/sidepanel';
import { openFixturePage } from '../helpers/pages';
import { mockLLMStreaming } from '../fixtures/mockLLM';
import { SESSION_INDEX_KEY } from '../../src/sidepanel/sidepanelGuards';
import {
  getConversationStorageKey,
  getHistoryStorageKey
} from '../../src/sidepanel/sessionHistory';
import type { Page, BrowserContext, Worker } from '@playwright/test';

/**
 * Regressions for the two session-history edge bugs reported on Edge:
 *
 *   Bug 1: "Send '你好', wait for the assistant reply, close the
 *           sidepanel, reopen it → the assistant's reply is gone."
 *
 *   Bug 2: "If the sidepanel is closed while the agent is running, the
 *           whole flow stops — it does not continue in the background."
 *
 * Both bugs live in the interaction between:
 *   - the sidepanel React tree (where messages live in `useState`)
 *   - the persistence path in useSessionPersistence (debounced save +
 *     beforeunload + pagehide handlers)
 *   - the sessionId restoration via getTabSessionKey(tabId)
 *
 * Persistence should be triggered by the 2s debounce in
 * useSessionPersistence's main effect, plus the cleanup function that
 * runs synchronously on effect teardown, plus beforeunload/pagehide.
 *
 * These specs assert the storage + DOM end state, not the trigger path.
 * If a future change accidentally disables one of those triggers, the
 * spec catches it.
 */

const SESSION_PREFIX = getHistoryStorageKey('');

type ChromeStorageGlobal = {
  chrome: {
    storage: {
      local: {
        get: (key: string) => Promise<Record<string, unknown>>;
      };
    };
  };
};

/** Read the session snapshot for a given sessionId from SW storage. */
async function readSessionSnapshot(sw: any, sessionId: string) {
  return sw.evaluate(
    async ({ key }: { key: string }) => {
      const got = await (globalThis as any).chrome.storage.local.get(key);
      return got[key] ?? null;
    },
    { key: getHistoryStorageKey(sessionId) }
  );
}

/** List all session IDs in storage. */
async function listSessionIds(sw: any): Promise<string[]> {
  return sw.evaluate(
    async ({ prefix }: { prefix: string }) => {
      const all = await (globalThis as any).chrome.storage.local.get(null);
      return Object.keys(all)
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length));
    },
    { prefix: SESSION_PREFIX }
  );
}

async function readSessionIndex(sw: any): Promise<unknown[]> {
  return sw.evaluate(
    async ({ key }: { key: string }) => {
      const got = await (globalThis as ChromeStorageGlobal).chrome.storage.local.get(key);
      return Array.isArray(got[key]) ? got[key] : [];
    },
    { key: SESSION_INDEX_KEY }
  );
}

function sessionIndexHasPreview(index: unknown[], previewText: string): boolean {
  return index.some((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const preview = (entry as Record<string, unknown>).preview;
    return typeof preview === 'string' && preview.includes(previewText);
  });
}

async function mockNeverResolvingLLM(sp: Page): Promise<void> {
  await sp.evaluate(() => {
    const w = window as typeof window & { __originalFetch?: typeof window.fetch };
    w.__originalFetch = w.__originalFetch || window.fetch.bind(window);
    window.fetch = (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (
        urlStr.includes('/v1/messages') ||
        urlStr.includes('/chat/completions') ||
        urlStr.includes('/v1/responses')
      ) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener?.('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }
      return w.__originalFetch!(url, init);
    };
  });
}

/**
 * Return the session snapshot(s) created during this test. We can't easily
 * know the sessionId up front, so we just take the most-recently-updated
 * snapshot among the `sidepanel_session_*` keys.
 */
async function readMostRecentSnapshot(sw: any) {
  return sw.evaluate(
    async ({ prefix }: { prefix: string }) => {
      const all = await (globalThis as any).chrome.storage.local.get(null);
      let best: { sessionId: string; snapshot: any; updatedAt: number } | null = null;
      for (const [k, v] of Object.entries(all)) {
        if (!k.startsWith(prefix) || !v) continue;
        // Prefer snapshots that have uiMessages (i.e. real chat snapshots)
        const snap = v as any;
        if (!Array.isArray(snap.uiMessages)) continue;
        const updatedAt = typeof snap.createdAt === 'number' ? snap.createdAt : 0;
        if (!best || updatedAt > best.updatedAt) {
          best = { sessionId: k.slice(prefix.length), snapshot: snap, updatedAt };
        }
      }
      return best;
    },
    { prefix: SESSION_PREFIX }
  );
}

/** Resolve the chrome.tabs id of a Playwright page via the SW. */
async function getChromeTabIdFor(sw: any, page: Page): Promise<number> {
  // The page's URL is the strongest identifier we have to correlate
  // a Playwright page to a chrome.tabs tab. The fixture-html pages are
  // served via file://, so the URL is stable per test.
  const url = page.url();
  const id = await sw.evaluate(
    async ({ url }: { url: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tabs = await (globalThis as any).chrome.tabs.query({});
      const match = tabs.find((t: any) => t.url === url);
      return match?.id ?? null;
    },
    { url }
  );
  if (id == null) {
    throw new Error(
      `Could not find a chrome.tabs entry for Playwright page ${url}. ` +
        `tabs: ` +
        JSON.stringify(
          await sw.evaluate(async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return await (globalThis as any).chrome.tabs.query({});
          })
        )
    );
  }
  return id;
}

/**
 * Create a real Chrome tab group with `tabId` as its main, so the sidepanel
 * is happy to render the chat UI for that tab. The default PANEL_READY
 * path uses `chrome.tabs.query({active: true, lastFocusedWindow: true})`
 * which in Playwright often returns the sidepanel page itself, not the
 * target. Driving group creation explicitly lets the spec stay focused
 * on session-history behavior, not the boot-time group routing.
 */
async function seedSuperDuckGroup(sw: any, tabId: number): Promise<void> {
  // Use the real Chrome API to actually group the tab. SW has "tabs" +
  // "tabGroups" permissions from the manifest.
  const groupId = await sw.evaluate(
    async ({ tabId }: { tabId: number }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Now seed the in-memory groupMetadata the SW's tabGroupManager would
  // maintain, by writing to the storage key it loads from.
  await sw.evaluate(
    async ({ tabId, chromeGroupId }: { tabId: number; chromeGroupId: number }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sw = globalThis as any;
      const existing = (await sw.chrome.storage.local.get('tabGroups')).tabGroups ?? {};
      // Read the tab's URL to derive a domain like the manager does
      let domain = 'blank';
      try {
        const tab = await sw.chrome.tabs.get(tabId);
        if (tab.url) domain = new URL(tab.url).hostname || 'blank';
      } catch {
        // ignore
      }
      existing[tabId] = {
        mainTabId: tabId,
        createdAt: Date.now(),
        domain,
        chromeGroupId,
        memberStates: { [tabId]: { indicatorState: 'none' } }
      };
      await sw.chrome.storage.local.set({ tabGroups: existing });
    },
    { tabId, chromeGroupId: groupId.chromeGroupId }
  );
}

/**
 * Open the sidepanel and (crucially) make it render the chat UI for
 * `targetTabId` instead of the "Open main chat" secondary view.
 *
 * The two-step dance is required because of how Playwright's headless
 * Chromium interacts with `chrome.sidePanel`:
 *
 *  1. `openSidepanel(context, extensionId, targetTabId)` embeds
 *     `?initialTabId=targetTabId` in the URL, but `useActiveTabId`
 *     overwrites that initial value as soon as the iframe mounts and
 *     `chrome.tabs.query({active: true, currentWindow: true})` returns
 *     the sidepanel page itself (the most-recently-created tab in
 *     Playwright is always active).
 *
 *  2. The boot-time PANEL_READY handler in the SW does the same — it
 *     picks the sidepanel page as the "active tab" and creates a group
 *     with that page as main, polluting the `tabGroups` storage entry.
 *
 *  3. We undo the pollution by re-writing storage so the fixture page
 *     is the main (re-using the same `chromeGroupId` so the chrome-side
 *     tab group state stays consistent), then we call
 *     `chrome.tabs.update(targetTabId, {active: true})` which fires
 *     `chrome.tabs.onActivated` and makes `useActiveTabId` snap to
 *     `targetTabId`.
 *
 *  The sidepanel then renders the chat UI and `.ProseMirror` is
 *  visible — verified by a final `waitForSelector` call.
 */
async function openChatSidepanel(
  context: BrowserContext,
  sw: Worker,
  extensionId: string,
  targetPage: Page,
  targetTabId: number
): Promise<Page> {
  const sp = await openSidepanel(context, extensionId, targetTabId);

  // Wait for the boot-time PANEL_READY to finish (it creates a stray
  // group keyed by the sidepanel's own tabId).
  await sp.waitForTimeout(2000);

  // Find the sidepanel's own tabId from the SW's tab list.
  const spTabId = await sw.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tabs = await (globalThis as any).chrome.tabs.query({});
    const sp = tabs.find((t: any) => (t.url ?? '').includes('sidepanel.html'));
    return sp?.id;
  });
  if (typeof spTabId !== 'number') {
    throw new Error('Could not resolve sidepanel tabId while opening chat sidepanel');
  }

  // Re-write tabGroups storage so the fixture is the main, reusing the
  // chromeGroupId the boot-time PANEL_READY already created.
  await sw.evaluate(
    async ({ tabId, spTabId: sideTabId }: { tabId: number; spTabId: number }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Flip the active tab. This triggers `chrome.tabs.onActivated` in
  // the sidepanel, which makes `useActiveTabId` set activeTabId to
  // targetTabId. Once query.tabId === targetTabId, the sidepanel
  // re-evaluates `refreshSecondaryState` and renders the chat UI
  // instead of the "Open main chat" view.
  await sw.evaluate(async (tabId: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (globalThis as any).chrome.tabs.update(tabId, { active: true });
  }, targetTabId);
  await targetPage.bringToFront();
  await sp.waitForTimeout(1500);

  // Make sure the chat UI is up. If it isn't, surface the DOM so the
  // failure is debuggable instead of a 10s ProseMirror timeout later.
  await sp.waitForSelector('.ProseMirror', { timeout: 10_000 });
  return sp;
}

test.describe('Session history: assistant reply persists across sidepanel close/reopen', () => {
  test("after sending '你好' and getting a reply, closing + reopening the sidepanel shows both messages", async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    await clearStorage(serviceWorker);
    await seedStorage(serviceWorker, getDefaultProviderConfig());

    const targetPage = await openFixturePage(context, 'simple-form.html');
    const targetTabId = await getChromeTabIdFor(serviceWorker, targetPage);
    await seedSuperDuckGroup(serviceWorker, targetTabId);

    // 1) First open — drive a complete user→assistant turn with a mocked LLM
    const sp1 = await openChatSidepanel(
      context,
      serviceWorker,
      extensionId,
      targetPage,
      targetTabId
    );

    await mockLLMStreaming(sp1, {
      responses: [
        {
          content: [{ type: 'text', text: '你好！很高兴见到你。' }],
          stop_reason: 'end_turn'
        }
      ]
    });
    await sendMessage(sp1, '你好');
    await waitForAssistantMessage(sp1, 15_000);

    // 2) Give the 2s debounce + cleanup-save path time to fire BEFORE we
    //    close. This is the happy path: the assistant reply is fully
    //    rendered, the debounce has elapsed, persistence already wrote.
    await sp1.waitForTimeout(2500);

    // 3) Assert storage has the snapshot with both messages
    const first = await readMostRecentSnapshot(serviceWorker);
    expect(first, 'a session snapshot should be persisted before close').toBeTruthy();
    expect(first!.snapshot.uiMessages.length).toBe(2);
    expect(first!.snapshot.uiMessages[0].role).toBe('user');
    expect(first!.snapshot.uiMessages[0].text).toContain('你好');
    expect(first!.snapshot.uiMessages[1].role).toBe('assistant');
    expect(first!.snapshot.uiMessages[1].text).toContain('很高兴见到你');

    // 4) Close and wait for any final persistence
    await sp1.close();
    await targetPage.waitForTimeout(3000);

    // 5) Reopen the sidepanel
    const sp2 = await openChatSidepanel(
      context,
      serviceWorker,
      extensionId,
      targetPage,
      targetTabId
    );
    // Wait for useSessionPersistence's load effect to run.
    await sp2.waitForTimeout(2000);

    // 6) Storage still has the snapshot
    const stillThere = await readSessionSnapshot(serviceWorker, first!.sessionId);
    expect(stillThere, 'snapshot should survive close').toBeTruthy();
    expect(stillThere.uiMessages.length).toBe(2);

    // 7) DOM check — the assistant's reply is visible in the reloaded
    //    sidepanel. This is the user-visible Bug 1: the user reported
    //    the reply disappearing; if it disappears, this assertion fails.
    const assistantBlocks = sp2.locator('.superduck-response');
    await expect(assistantBlocks.first()).toContainText('很高兴见到你', {
      timeout: 5000
    });

    // 8) The user message text should also be in the DOM (rendered in
    //    UserMessageRow via ReactMarkdown; we just check raw content).
    const pageContent = await sp2.content();
    expect(pageContent).toContain('你好');

    await sp2.close();
    await targetPage.close();
  });
});

test.describe('Session history: task completion keeps the visible transcript', () => {
  test('switching tabs while a task is running does not reset the sidepanel after completion', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    test.setTimeout(60_000);

    await clearStorage(serviceWorker);
    await seedStorage(serviceWorker, getDefaultProviderConfig());

    const targetPage = await openFixturePage(context, 'simple-form.html');
    const targetTabId = await getChromeTabIdFor(serviceWorker, targetPage);
    await seedSuperDuckGroup(serviceWorker, targetTabId);

    const sp = await openChatSidepanel(
      context,
      serviceWorker,
      extensionId,
      targetPage,
      targetTabId
    );

    await mockLLMStreaming(sp, {
      responses: [
        {
          content: [
            {
              type: 'text',
              text: '任务执行完成，历史消息应该继续留在侧边栏里。'
            }
          ],
          stop_reason: 'end_turn'
        },
        {
          content: [
            {
              type: 'text',
              text: '任务执行完成，历史消息应该继续留在侧边栏里。'
            }
          ],
          stop_reason: 'end_turn'
        },
        {
          content: [
            {
              type: 'text',
              text: '后续任务继续使用原来的会话和页面。'
            }
          ],
          stop_reason: 'end_turn'
        }
      ]
    });

    // Keep the request in-flight until after the tab switch. This makes the
    // ordering deterministic on slow CI instead of relying on a fixed timeout.
    await sp.evaluate(() => {
      const win = window as Window & {
        __mockedDelayedFetch?: boolean;
        __llmRequestStarted?: boolean;
        __llmResponseReleased?: boolean;
        __releaseLlmResponse?: () => void;
        __llmRequestBodies?: unknown[];
      };
      win.__llmRequestBodies = [];
      win.__llmRequestStarted = false;
      win.__llmResponseReleased = false;
      win.__releaseLlmResponse = undefined;
      const mockedFetch = window.fetch;
      window.fetch = async (
        url: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1]
      ) => {
        const urlStr =
          typeof url === 'string'
            ? url
            : url instanceof Request
              ? url.url
              : url instanceof URL
                ? url.href
                : String(url);
        const isLLMCall =
          urlStr.includes('/v1/messages') ||
          urlStr.includes('/chat/completions') ||
          urlStr.includes('/v1/responses');
        if (isLLMCall) {
          const body = init?.body;
          if (typeof body === 'string') {
            try {
              win.__llmRequestBodies?.push(JSON.parse(body) as unknown);
            } catch {
              win.__llmRequestBodies?.push(body);
            }
          }
          win.__llmRequestStarted = true;
          if (!win.__llmResponseReleased) {
            await new Promise<void>((resolve) => {
              win.__releaseLlmResponse = () => {
                win.__llmResponseReleased = true;
                resolve();
              };
            });
          }
        }
        return mockedFetch(url, init);
      };
      win.__mockedDelayedFetch = true;
    });

    await sendMessage(sp, '执行一个会切换 tab 的任务');
    await sp.locator('[data-test-id="stop-button"]').waitFor({
      state: 'visible',
      timeout: 5000
    });
    await expect
      .poll(
        () =>
          sp.evaluate(() => {
            const win = window as Window & { __llmRequestStarted?: boolean };
            return Boolean(win.__llmRequestStarted);
          }),
        { timeout: 5000 }
      )
      .toBe(true);

    const otherPage = await openFixturePage(context, 'long-article.html');
    const otherTabId = await getChromeTabIdFor(serviceWorker, otherPage);
    await serviceWorker.evaluate(async (tabId: number) => {
      await (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome.tabs.update(
        tabId,
        { active: true }
      );
    }, otherTabId);
    await otherPage.bringToFront();
    await sp.evaluate(() => {
      const win = window as Window & { __releaseLlmResponse?: () => void };
      win.__releaseLlmResponse?.();
    });

    await waitForAssistantMessage(sp, 20_000);

    // Give the session resolver a chance to run after isAgentRunning flips
    // back to false. The regression cleared messages during this window.
    await sp.waitForTimeout(1500);

    const pageContent = await sp.content();
    expect(pageContent).toContain('执行一个会切换 tab 的任务');
    expect(pageContent).toContain('历史消息应该继续留在侧边栏里');

    // The first turn may consume more than one mocked response while the tab
    // switch settles. Pin the next response to the follow-up phase.
    await sp.evaluate(() => {
      const win = window as Window & { __mockLLMIndex?: number };
      win.__mockLLMIndex = 2;
    });

    await sendMessage(sp, '继续处理上一页');
    const readFollowUpRequest = () =>
      sp.evaluate((followUpText) => {
        const win = window as Window & { __llmRequestBodies?: unknown[] };
        return (
          win.__llmRequestBodies
            ?.map((body) => JSON.stringify(body))
            .find((body) => body.includes(followUpText)) || ''
        );
      }, '继续处理上一页');
    await expect.poll(readFollowUpRequest, { timeout: 5000 }).not.toBe('');
    const followUpRequest = await readFollowUpRequest();
    await expect(sp.locator('.superduck-response').last()).toContainText(
      '后续任务继续使用原来的会话和页面',
      { timeout: 20_000 }
    );
    expect(followUpRequest).toMatch(new RegExp(`\\b${targetTabId}\\b`));
    expect(followUpRequest).not.toMatch(new RegExp(`\\b${otherTabId}\\b`));

    await sp.close();
    await otherPage.close();
    await targetPage.close();
  });
});

test.describe('Session history: empty conversations are not persisted', () => {
  test('opening and closing the sidepanel without sending a message does not create a history item', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    await clearStorage(serviceWorker);
    await seedStorage(serviceWorker, getDefaultProviderConfig());

    const targetPage = await openFixturePage(context, 'simple-form.html');
    const targetTabId = await getChromeTabIdFor(serviceWorker, targetPage);
    await seedSuperDuckGroup(serviceWorker, targetTabId);

    const sp = await openChatSidepanel(
      context,
      serviceWorker,
      extensionId,
      targetPage,
      targetTabId
    );

    await sp.waitForTimeout(2500);
    await sp.close();
    await targetPage.waitForTimeout(1500);

    const sessionIds = await listSessionIds(serviceWorker);
    expect(sessionIds, 'empty sidepanel open should not persist snapshots').toHaveLength(0);

    const index = await readSessionIndex(serviceWorker);
    expect(index, 'empty sidepanel open should not create history index entries').toHaveLength(0);

    await targetPage.close();
  });
});

test.describe('Session history: conversation snapshot fallback', () => {
  test('history panel keeps a recoverable entry when the session snapshot is empty', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    await clearStorage(serviceWorker);
    await seedStorage(serviceWorker, getDefaultProviderConfig());

    const sessionId = 'empty-session-with-conversation-fallback';
    const conversationUuid = 'recoverable-conversation';
    const prompt = '这条历史来自 conversation fallback';
    const now = Date.now();
    await serviceWorker.evaluate(
      async ({
        sessionIndexKey,
        sessionKey,
        conversationKey,
        sessionId,
        conversationUuid,
        prompt,
        now
      }: {
        sessionIndexKey: string;
        sessionKey: string;
        conversationKey: string;
        sessionId: string;
        conversationUuid: string;
        prompt: string;
        now: number;
      }) => {
        const emptySnapshot = {
          uiMessages: [],
          apiMessages: [],
          selectedModel: 'prov_mock',
          permissionMode: 'skip_all_permission_checks',
          createdAt: now,
          conversationUuid
        };
        const conversationSnapshot = {
          ...emptySnapshot,
          uiMessages: [{ id: 'u1', role: 'user', text: prompt }],
          apiMessages: [{ role: 'user', content: prompt }]
        };

        await (
          globalThis as typeof globalThis & { chrome: typeof chrome }
        ).chrome.storage.local.set({
          [sessionIndexKey]: [
            {
              sessionId,
              conversationUuid,
              createdAt: now,
              updatedAt: now,
              preview: prompt
            }
          ],
          [sessionKey]: emptySnapshot,
          [conversationKey]: conversationSnapshot
        });
      },
      {
        sessionIndexKey: SESSION_INDEX_KEY,
        sessionKey: getHistoryStorageKey(sessionId),
        conversationKey: getConversationStorageKey(conversationUuid),
        sessionId,
        conversationUuid,
        prompt,
        now
      }
    );

    const targetPage = await openFixturePage(context, 'simple-form.html');
    const targetTabId = await getChromeTabIdFor(serviceWorker, targetPage);
    await seedSuperDuckGroup(serviceWorker, targetTabId);

    const sp = await openChatSidepanel(
      context,
      serviceWorker,
      extensionId,
      targetPage,
      targetTabId
    );
    await sp.locator('button[aria-label="History"]').click();

    await expect(sp.getByRole('button', { name: new RegExp(prompt) })).toBeVisible({
      timeout: 5000
    });
    expect(sessionIndexHasPreview(await readSessionIndex(serviceWorker), prompt)).toBe(true);

    await sp.close();
    await targetPage.close();
  });
});

test.describe('Session history: user-only interrupted turns', () => {
  test("stopping before the LLM returns still records the user's message in history", async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    await clearStorage(serviceWorker);
    await seedStorage(serviceWorker, getDefaultProviderConfig());

    const targetPage = await openFixturePage(context, 'simple-form.html');
    const targetTabId = await getChromeTabIdFor(serviceWorker, targetPage);
    await seedSuperDuckGroup(serviceWorker, targetTabId);

    const sp = await openChatSidepanel(
      context,
      serviceWorker,
      extensionId,
      targetPage,
      targetTabId
    );
    await mockNeverResolvingLLM(sp);

    const prompt = '只记录这个被中断的问题';
    await sendMessage(sp, prompt);
    const stopButton = sp.locator('[data-test-id="stop-button"]');
    await expect(stopButton).toBeVisible({ timeout: 5000 });
    await stopButton.click();
    await sp.waitForTimeout(2500);

    const best = await readMostRecentSnapshot(serviceWorker);
    expect(best, 'a stopped user-only turn should persist a snapshot').toBeTruthy();
    expect(
      best!.snapshot.uiMessages.some((message: unknown) => {
        if (typeof message !== 'object' || message === null) return false;
        const text = (message as Record<string, unknown>).text;
        return typeof text === 'string' && text.includes(prompt);
      })
    ).toBe(true);

    const index = await readSessionIndex(serviceWorker);
    expect(
      sessionIndexHasPreview(index, prompt),
      'a stopped user-only turn should be listed in the raw history index'
    ).toBe(true);

    await sp.close();
    await targetPage.close();
  });

  test('the history panel lists the current in-progress user-only turn', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    await clearStorage(serviceWorker);
    await seedStorage(serviceWorker, getDefaultProviderConfig());

    const targetPage = await openFixturePage(context, 'simple-form.html');
    const targetTabId = await getChromeTabIdFor(serviceWorker, targetPage);
    await seedSuperDuckGroup(serviceWorker, targetTabId);

    const sp = await openChatSidepanel(
      context,
      serviceWorker,
      extensionId,
      targetPage,
      targetTabId
    );
    await mockNeverResolvingLLM(sp);

    const prompt = '执行中也应该显示在历史面板';
    await sendMessage(sp, prompt);
    await expect(sp.locator('[data-test-id="stop-button"]')).toBeVisible({ timeout: 5000 });

    // Wait for the persistence debounce to write the in-progress user turn.
    await sp.waitForTimeout(2500);
    await sp.locator('button[aria-label="History"]').click();

    await expect(sp.getByRole('heading', { name: '历史对话' })).toBeVisible({ timeout: 5000 });
    await expect(sp.getByRole('button', { name: `当前会话 ${prompt}` })).toBeVisible({
      timeout: 5000
    });

    await sp.close();
    await targetPage.close();
  });
});

test.describe('Session history: user message persists when sidepanel is closed mid-agent-run', () => {
  test("sending '你好' and immediately closing the sidepanel persists at least the user message", async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    await clearStorage(serviceWorker);
    await seedStorage(serviceWorker, getDefaultProviderConfig());

    const targetPage = await openFixturePage(context, 'simple-form.html');
    const targetTabId = await getChromeTabIdFor(serviceWorker, targetPage);
    await seedSuperDuckGroup(serviceWorker, targetTabId);

    const sp1 = await openChatSidepanel(
      context,
      serviceWorker,
      extensionId,
      targetPage,
      targetTabId
    );

    // Simulates an agent that is mid-streaming (or mid-tool-call) when
    // the user closes the sidepanel. There's no assistant reply to
    // wait for; we close almost immediately after sending.
    await mockNeverResolvingLLM(sp1);

    await sendMessage(sp1, '你好');

    // Give the user message time to be added to React state and trigger
    // the persistence debounce, but NOT enough for the agent to reply
    // (it never will).
    await sp1.waitForTimeout(1500);

    await sp1.close();

    // Wait for the 2s debounce + beforeunload to fire.
    await targetPage.waitForTimeout(3500);

    const sp2 = await openChatSidepanel(
      context,
      serviceWorker,
      extensionId,
      targetPage,
      targetTabId
    );
    await sp2.waitForTimeout(2000);

    // Storage: the user message should be persisted, even if the
    // assistant never got a chance to reply.
    const sessionIds = await listSessionIds(serviceWorker);
    expect(
      sessionIds.length,
      'at least one session snapshot should exist after sidepanel close'
    ).toBeGreaterThan(0);

    const best = await readMostRecentSnapshot(serviceWorker);
    expect(best, 'a session snapshot with uiMessages should exist').toBeTruthy();
    const userMessages = best!.snapshot.uiMessages.filter((m: any) => m.role === 'user');
    expect(
      userMessages.length,
      'user message must be persisted even when assistant never replies'
    ).toBeGreaterThanOrEqual(1);
    expect(userMessages[0].text).toContain('你好');

    // DOM check: reopened sidepanel shows the user message
    const pageContent = await sp2.content();
    expect(pageContent).toContain('你好');

    await sp2.close();
    await targetPage.close();
  });
});
