import type { TabGroupManager } from './tabGroups';
import { getMemberOrigin } from './tabNavigationIsolation';

const INDICATOR_UPDATE_DELAY = 100;
let indicatorUpdateTimer: ReturnType<typeof setTimeout> | null = null;
const contentScriptReadyTabs = new Set<number>();
const pendingInjections = new Map<number, Promise<boolean>>();
let indicatorScriptPathResolved = false;
let indicatorScriptPath: string | null = null;

export function onTabRemoved(tabId: number): void {
  contentScriptReadyTabs.delete(tabId);
}

export function getTabIndicatorState(mgr: TabGroupManager, tabId: number): string {
  for (const [, meta] of mgr.groupMetadata.entries()) {
    const state = meta.memberStates.get(tabId);
    if (state) return state.indicatorState;
  }
  return 'none';
}

export async function setTabIndicatorState(
  mgr: TabGroupManager,
  tabId: number,
  state: string,
  isMcp?: boolean,
  queueUpdate = true
): Promise<void> {
  for (const [, meta] of mgr.groupMetadata.entries()) {
    if ((await mgr.getGroupMembers(meta.chromeGroupId)).some((m) => m.tabId === tabId)) {
      if ('static' === state && (await mgr.isGroupDismissed(meta.chromeGroupId))) return;
      const existing = meta.memberStates.get(tabId);
      meta.memberStates.set(tabId, {
        ...(existing ?? {}),
        indicatorState: state,
        previousIndicatorState: existing?.indicatorState,
        isMcp: isMcp ?? existing?.isMcp,
        origin: getMemberOrigin(existing),
        disposition: existing?.disposition ?? 'active'
      });
      break;
    }
  }
  if (queueUpdate) {
    queueIndicatorUpdate(mgr, tabId, state);
  }
}

export async function setGroupIndicatorState(
  mgr: TabGroupManager,
  mainTabId: number,
  state: string
): Promise<void> {
  const group = await mgr.getGroupDetails(mainTabId);
  'pulsing' === state
    ? await setTabIndicatorState(mgr, mainTabId, 'pulsing')
    : await setTabIndicatorState(mgr, mainTabId, state);
  for (const member of group.memberTabs)
    if (member.tabId !== mainTabId) {
      const memberState = 'none' === state ? 'none' : 'static';
      await setTabIndicatorState(mgr, member.tabId, memberState);
    }
}

export async function showSecondaryTabIndicators(
  mgr: TabGroupManager,
  mainTabId: number
): Promise<void> {
  const group = await mgr.getGroupDetails(mainTabId);
  if (await mgr.isGroupDismissed(group.chromeGroupId)) return;
  for (const member of group.memberTabs)
    member.tabId !== mainTabId && (await setTabIndicatorState(mgr, member.tabId, 'static'));
  await processIndicatorQueue(mgr);
}

export async function showStaticIndicatorsForChromeGroup(
  mgr: TabGroupManager,
  chromeGroupId: number
): Promise<void> {
  if (await mgr.isGroupDismissed(chromeGroupId)) return;
  const tabs = await chrome.tabs.query({ groupId: chromeGroupId });
  if (0 === tabs.length) return;
  let mainTabId: number | undefined;
  for (const [id, meta] of mgr.groupMetadata.entries())
    if (meta.chromeGroupId === chromeGroupId) {
      mainTabId = id;
      break;
    }
  mainTabId || (tabs.sort((a, b) => a.index - b.index), (mainTabId = tabs[0].id));
  for (const tab of tabs)
    if (tab.id && tab.id !== mainTabId)
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_STATIC_INDICATOR' });
      } catch {
        // ignore
      }
}

export async function hideSecondaryTabIndicators(
  mgr: TabGroupManager,
  mainTabId: number
): Promise<void> {
  try {
    const group = await mgr.getGroupDetails(mainTabId);
    for (const member of group.memberTabs)
      member.tabId !== mainTabId && (await setTabIndicatorState(mgr, member.tabId, 'none'));
    await processIndicatorQueue(mgr);
  } catch {
    // ignore
  }
}

export async function hideIndicatorForToolUse(mgr: TabGroupManager, tabId: number): Promise<void> {
  try {
    const currentState = getTabIndicatorState(mgr, tabId);
    for (const [, meta] of mgr.groupMetadata.entries()) {
      const memberState = meta.memberStates.get(tabId);
      if (memberState) {
        memberState.previousIndicatorState = currentState;
        memberState.indicatorState = 'hidden_for_screenshot';
        break;
      }
    }
    await sendIndicatorMessage(mgr, tabId, 'HIDE_FOR_TOOL_USE');
  } catch {
    // ignore
  }
}

export async function restoreIndicatorAfterToolUse(
  mgr: TabGroupManager,
  tabId: number
): Promise<void> {
  try {
    for (const [, meta] of mgr.groupMetadata.entries()) {
      const memberState = meta.memberStates.get(tabId);
      if (memberState && void 0 !== memberState.previousIndicatorState) {
        const previousState = memberState.previousIndicatorState;
        if (
          ((memberState.indicatorState = previousState),
          delete memberState.previousIndicatorState,
          'static' === previousState)
        ) {
          if (await mgr.isGroupDismissed(meta.chromeGroupId)) return;
        }
        if (previousState === 'none') return;
        const messageType = 'SHOW_AFTER_TOOL_USE';
        await sendIndicatorMessage(mgr, tabId, messageType);
        break;
      }
    }
  } catch {
    // ignore
  }
}

export async function startRunning(mgr: TabGroupManager, mainTabId: number): Promise<void> {
  await setGroupIndicatorState(mgr, mainTabId, 'pulsing');
}

export async function showRunningIndicatorImmediately(
  mgr: TabGroupManager,
  tabId: number,
  isMcp = true
): Promise<void> {
  await setTabIndicatorState(mgr, tabId, 'pulsing', isMcp, false);
  await ensureIndicatorContentScript(tabId);
  await sendIndicatorMessage(mgr, tabId, 'SHOW_AGENT_INDICATORS', isMcp);
}

async function ensureIndicatorContentScript(tabId: number): Promise<boolean> {
  if (contentScriptReadyTabs.has(tabId)) return true;

  const existing = pendingInjections.get(tabId);
  if (existing) return existing;

  const promise = doEnsureContentScript(tabId).finally(() => {
    pendingInjections.delete(tabId);
  });
  pendingInjections.set(tabId, promise);
  return promise;
}

async function doEnsureContentScript(tabId: number): Promise<boolean> {
  if (await pingContentScript(tabId)) {
    contentScriptReadyTabs.add(tabId);
    return true;
  }

  const scriptPath = getIndicatorContentScriptPath();
  if (!scriptPath) return false;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [scriptPath],
      injectImmediately: true
    });
  } catch {
    return false;
  }

  for (const delay of [0, 30, 60]) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    if (await pingContentScript(tabId)) {
      contentScriptReadyTabs.add(tabId);
      return true;
    }
  }
  return false;
}

function getIndicatorContentScriptPath(): string | null {
  if (indicatorScriptPathResolved) return indicatorScriptPath;
  indicatorScriptPathResolved = true;

  const manifest = chrome.runtime.getManifest();
  for (const cs of manifest.content_scripts ?? []) {
    const file = cs.js?.find((f: string) => f.includes('agent-visual-indicator'));
    if (file) {
      indicatorScriptPath = file;
      return file;
    }
  }
  return null;
}

async function pingContentScript(tabId: number): Promise<boolean> {
  let timeoutId: ReturnType<typeof setTimeout>;
  try {
    const response = await Promise.race([
      chrome.tabs.sendMessage(tabId, { type: 'CONTENT_PING' }),
      new Promise((r) => {
        timeoutId = setTimeout(() => r(null), 500);
      })
    ]);
    clearTimeout(timeoutId!);
    return (response as any)?.success === true;
  } catch {
    clearTimeout(timeoutId!);
    return false;
  }
}

export async function stopRunning(mgr: TabGroupManager): Promise<void> {
  for (const [, meta] of mgr.groupMetadata.entries())
    for (const [tabId] of meta.memberStates) await setTabIndicatorState(mgr, tabId, 'none');
  await processIndicatorQueue(mgr);
}

export async function clearIndicatorsForGroup(
  mgr: TabGroupManager,
  mainTabId: number
): Promise<void> {
  const meta = mgr.groupMetadata.get(mainTabId);
  if (!meta) return;
  for (const [, memberState] of meta.memberStates) {
    memberState.indicatorState = 'none';
    delete memberState.previousIndicatorState;
    memberState.pendingUpdate = 'none';
  }
  await processIndicatorQueue(mgr);
}

export async function hideAgentIndicatorsForTab(
  mgr: TabGroupManager,
  tabId: number
): Promise<void> {
  for (const [, meta] of mgr.groupMetadata.entries()) {
    const memberState = meta.memberStates.get(tabId);
    if (!memberState) continue;
    memberState.indicatorState = 'none';
    delete memberState.previousIndicatorState;
    delete memberState.pendingUpdate;
    await mgr.saveToStorage();
    await sendIndicatorMessage(mgr, tabId, 'HIDE_AGENT_INDICATORS', memberState.isMcp, {
      critical: true
    });
    await sendIndicatorMessage(mgr, tabId, 'HIDE_STATIC_INDICATOR', memberState.isMcp, {
      critical: true
    });
    return;
  }
  await sendIndicatorMessage(mgr, tabId, 'HIDE_AGENT_INDICATORS', true, { critical: true });
  await sendIndicatorMessage(mgr, tabId, 'HIDE_STATIC_INDICATOR', true, { critical: true });
}

export function queueIndicatorUpdate(mgr: TabGroupManager, tabId: number, state: string): void {
  for (const [, meta] of mgr.groupMetadata.entries()) {
    const memberState = meta.memberStates.get(tabId);
    if (memberState) {
      memberState.pendingUpdate = state;
      break;
    }
  }
  indicatorUpdateTimer && clearTimeout(indicatorUpdateTimer);
  indicatorUpdateTimer = setTimeout(() => {
    processIndicatorQueue(mgr);
  }, INDICATOR_UPDATE_DELAY);
}

export async function processIndicatorQueue(mgr: TabGroupManager): Promise<void> {
  for (const [, meta] of mgr.groupMetadata.entries())
    for (const [tabId, memberState] of meta.memberStates)
      if (memberState.pendingUpdate) {
        let messageType: string;
        switch (memberState.pendingUpdate) {
          case 'pulsing':
            messageType = 'SHOW_AGENT_INDICATORS';
            break;
          case 'static':
            messageType = 'SHOW_STATIC_INDICATOR';
            break;
          case 'none':
            await sendIndicatorMessage(mgr, tabId, 'HIDE_AGENT_INDICATORS', memberState.isMcp);
            messageType = 'HIDE_STATIC_INDICATOR';
            break;
          default:
            continue;
        }
        await sendIndicatorMessage(mgr, tabId, messageType, memberState.isMcp);
        delete memberState.pendingUpdate;
      }
}

export async function sendIndicatorMessage(
  mgr: TabGroupManager,
  tabId: number,
  messageType: string,
  isMcp?: boolean,
  options?: { critical?: boolean }
): Promise<boolean> {
  const buildMessage = () => ({ type: messageType, isMcp });
  const critical = options?.critical ?? messageType.startsWith('HIDE_');
  const backoffMs = critical ? [0, 200, 500] : [0];
  const ACK_TIMEOUT_MS = 800;

  const sendOnce = async (): Promise<boolean> => {
    let timeoutId: ReturnType<typeof setTimeout>;
    try {
      const result = await Promise.race([
        chrome.tabs.sendMessage(tabId, buildMessage()),
        new Promise<null>((resolve) => {
          timeoutId = setTimeout(() => resolve(null), ACK_TIMEOUT_MS);
        })
      ]);
      clearTimeout(timeoutId!);
      return (result as { success?: boolean } | null)?.success === true;
    } catch {
      clearTimeout(timeoutId!);
      return false;
    }
  };

  if (await sendOnce()) return true;

  for (const delay of backoffMs) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    contentScriptReadyTabs.delete(tabId);
    if (!(await ensureIndicatorContentScript(tabId))) continue;
    if (await sendOnce()) return true;
  }
  return false;
}
