import type { TabGroupManager } from './tabGroups';
import { TAB_GROUP_TITLE } from './types';

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
      if ((await chrome.tabGroups.get(meta.chromeGroupId)).title !== TAB_GROUP_TITLE) return;
      const otherGroupColors = (await chrome.tabGroups.query({}))
        .filter((g) => g.id !== meta.chromeGroupId)
        .map((g) => g.color)
        .filter((color): color is chrome.tabGroups.Color => typeof color === 'string');
      const allColors = [
        chrome.tabGroups.Color.GREY,
        chrome.tabGroups.Color.BLUE,
        chrome.tabGroups.Color.RED,
        chrome.tabGroups.Color.YELLOW,
        chrome.tabGroups.Color.GREEN,
        chrome.tabGroups.Color.PINK,
        chrome.tabGroups.Color.PURPLE,
        chrome.tabGroups.Color.CYAN,
        chrome.tabGroups.Color.ORANGE
      ];
      const unusedColors = allColors.filter((c) => !otherGroupColors.includes(c));
      let chosenColor: chrome.tabGroups.Color;
      if (unusedColors.length > 0) chosenColor = unusedColors[0];
      else {
        const colorCounts = new Map<chrome.tabGroups.Color, number>();
        allColors.forEach((c) => colorCounts.set(c, 0));
        otherGroupColors.forEach((c) => {
          colorCounts.set(c, (colorCounts.get(c) || 0) + 1);
        });
        let minCount = Infinity;
        chosenColor = chrome.tabGroups.Color.ORANGE;
        for (const [color, count] of colorCounts.entries())
          count < minCount && ((minCount = count), (chosenColor = color));
      }
      const displayTitle = isLoading ? `⌛${title.trim()}` : title.trim();
      await chrome.tabGroups.update(meta.chromeGroupId, {
        title: displayTitle,
        color: chosenColor
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
