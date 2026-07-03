import type { TabGroupManager } from './tabGroups';
import { TAB_GROUP_MARKER } from './types';

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
      const currentTitle = (await chrome.tabGroups.get(meta.chromeGroupId)).title || '';
      const titleWithoutPrefix = currentTitle.replace(/^(⌛|🔔|✅)/, '').trim();
      const explicitTitles = new Set(
        Array.from(mgr.sessionGroupTitles.values(), (name) => `${TAB_GROUP_MARKER} ${name}`)
      );
      if (explicitTitles.has(titleWithoutPrefix)) return;
      if (!titleWithoutPrefix.includes(TAB_GROUP_MARKER)) return;
      // Every group reaching here carries the MCP marker (the guard above
      // returns otherwise), i.e. it is a managed MCP group. Such groups MUST
      // stay ORANGE: findMcpTabGroupByCharacteristics recognizes them by color
      // and ensureMcpGroupCharacteristics enforces ORANGE. The old palette
      // picker could even select the semantically-reserved GREEN/ORANGE,
      // turning a freshly-started task green and breaking SW-restart lookup.
      // Set the title only and leave the color untouched.
      const trimmedTitle = title.trim();
      const markedTitle = trimmedTitle.includes(TAB_GROUP_MARKER)
        ? trimmedTitle
        : `${TAB_GROUP_MARKER} ${trimmedTitle}`;
      const displayTitle = isLoading ? `⌛${markedTitle}` : markedTitle;
      await chrome.tabGroups.update(meta.chromeGroupId, {
        title: displayTitle
      });
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
  await updateTabGroupPrefix(mgr, mainTabId, '✅');
}

export async function addLoadingPrefix(mgr: TabGroupManager, mainTabId: number): Promise<void> {
  await updateTabGroupPrefix(mgr, mainTabId, '⌛');
}

export async function addPermissionPrefix(mgr: TabGroupManager, mainTabId: number): Promise<void> {
  await updateTabGroupPrefix(mgr, mainTabId, '🔔');
}

export async function removeCompletionPrefix(
  mgr: TabGroupManager,
  mainTabId: number
): Promise<void> {
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
