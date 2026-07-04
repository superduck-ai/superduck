import type { TabGroupManager } from './tabGroups';
import { DEFAULT_SESSION_KEY, TAB_GROUP_MARKER } from './types';
import { decorateGroupTitleForStatus } from './tabGroupAppearance';

export async function updateGroupTitle(
  mgr: TabGroupManager,
  mainTabId: number,
  title: string,
  isLoading = false
): Promise<void> {
  if (!title || '' === title.trim()) return;
  const meta = mgr.groupMetadata.get(mainTabId);
  if (meta)
    try {
      if (isLoading && meta.status !== 'active') {
        meta.status = 'active';
        await mgr.saveToStorage();
      }
      const sessionId = meta.sessionId ?? DEFAULT_SESSION_KEY;
      const explicitName = mgr.sessionGroupTitles.get(sessionId);
      const trimmedTitle = explicitName ?? title.trim();
      const markedTitle = trimmedTitle.includes(TAB_GROUP_MARKER)
        ? trimmedTitle
        : `${TAB_GROUP_MARKER} ${trimmedTitle}`;
      const statusTitle = decorateGroupTitleForStatus(markedTitle, meta.status);
      const displayTitle = explicitName
        ? statusTitle
        : isLoading
          ? `⌛${statusTitle}`
          : statusTitle;
      const currentGroup = await chrome.tabGroups.get(meta.chromeGroupId);
      const patch: { title?: string; color?: chrome.tabGroups.Color } = {};
      if ((currentGroup.title || '') !== displayTitle) patch.title = displayTitle;
      if (isLoading && currentGroup.color !== chrome.tabGroups.Color.ORANGE) {
        patch.color = chrome.tabGroups.Color.ORANGE;
      }
      if (Object.keys(patch).length === 0) return;
      await chrome.tabGroups.update(meta.chromeGroupId, patch);
    } catch {
      // ignore
    }
}

export async function updateTabGroupPrefix(
  mgr: TabGroupManager,
  mainTabId: number,
  prefix: string | null,
  removePrefix?: string
): Promise<void> {
  const meta = mgr.groupMetadata.get(mainTabId);
  if (!meta) return;
  let retryCount = 0;
  const prefixPattern = /^(⌛|🔔|✅)/;
  const tryUpdate = async (): Promise<void> => {
    try {
      const currentTitle = (await chrome.tabGroups.get(meta.chromeGroupId)).title || '';
      if (removePrefix && !currentTitle.startsWith(removePrefix)) return;
      if (prefix && currentTitle.startsWith(prefix)) return;
      if (!prefix && !currentTitle.match(prefixPattern)) return;
      const stripped = currentTitle.replace(prefixPattern, '').trim();
      const newTitle = prefix ? `${prefix}${stripped}` : stripped;
      await chrome.tabGroups.update(meta.chromeGroupId, {
        title: newTitle
      });
    } catch (err) {
      if ((retryCount++, retryCount <= 3)) {
        return (await new Promise((r) => setTimeout(r, 500)), tryUpdate());
      }
    }
  };
  await tryUpdate();
}

export async function addCompletionPrefix(mgr: TabGroupManager, mainTabId: number): Promise<void> {
  const meta = mgr.groupMetadata.get(mainTabId);
  if (meta) {
    meta.status = 'completed';
    await mgr.saveToStorage();
  }
  await updateTabGroupPrefix(mgr, mainTabId, '✅');
}

export async function addLoadingPrefix(mgr: TabGroupManager, mainTabId: number): Promise<void> {
  const meta = mgr.groupMetadata.get(mainTabId);
  if (meta && meta.status !== 'active') {
    meta.status = 'active';
    await mgr.saveToStorage();
  }
  await updateTabGroupPrefix(mgr, mainTabId, '⌛');
}

export async function addPermissionPrefix(mgr: TabGroupManager, mainTabId: number): Promise<void> {
  await updateTabGroupPrefix(mgr, mainTabId, '🔔');
}

export async function removeCompletionPrefix(
  mgr: TabGroupManager,
  mainTabId: number
): Promise<void> {
  const meta = mgr.groupMetadata.get(mainTabId);
  if (meta?.status === 'completed') {
    meta.status = 'active';
    await mgr.saveToStorage();
  }
  await updateTabGroupPrefix(mgr, mainTabId, null, '✅');
}

export async function setGroupColor(
  mgr: TabGroupManager,
  mainTabId: number,
  color: chrome.tabGroups.Color
): Promise<void> {
  const meta = mgr.groupMetadata.get(mainTabId);
  if (!meta) return;
  try {
    await chrome.tabGroups.update(meta.chromeGroupId, { color });
  } catch {
    // ignore — group may no longer exist
  }
}

export async function removePrefix(mgr: TabGroupManager, mainTabId: number): Promise<void> {
  await updateTabGroupPrefix(mgr, mainTabId, null);
}
