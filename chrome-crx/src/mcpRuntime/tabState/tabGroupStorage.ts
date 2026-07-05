import type { TabGroupManager } from './tabGroups';
import type { GroupMetadata, MemberState, StoredGroupMetadata } from './types';
import { normalizeMemberState } from './tabNavigationIsolation';

export async function loadFromStorage(mgr: TabGroupManager): Promise<void> {
  try {
    const stored = await chrome.storage.local.get([mgr.STORAGE_KEY, mgr.SESSION_TITLES_KEY]);
    const data = stored[mgr.STORAGE_KEY];
    data &&
      'object' == typeof data &&
      (mgr.groupMetadata = new Map(
        Object.entries(data as Record<string, StoredGroupMetadata>).map(([key, value]) => {
          let hasLegacyMemberOrigins = false;
          const memberStates = value.memberStates
            ? new Map(
                Object.entries(value.memberStates).map(([memberKey, memberValue]) => {
                  if (memberValue.origin === undefined) hasLegacyMemberOrigins = true;
                  return [parseInt(memberKey, 10), normalizeMemberState(memberValue)];
                })
              )
            : new Map<number, MemberState>();
          const entry: GroupMetadata = {
            ...value,
            memberStates,
            hasLegacyMemberOrigins
          };
          return [parseInt(key, 10), entry];
        })
      ));
    const titles = stored[mgr.SESSION_TITLES_KEY];
    mgr.sessionGroupTitles =
      titles && typeof titles === 'object'
        ? new Map(
            Object.entries(titles as Record<string, string>).filter(
              ([, value]) => typeof value === 'string' && value.trim()
            )
          )
        : new Map();
  } catch (err) {
    // ignore
  }
}

export async function saveToStorage(mgr: TabGroupManager): Promise<void> {
  try {
    const serialized = Object.fromEntries(
      Array.from(mgr.groupMetadata.entries()).map(([key, value]) => {
        const { hasLegacyMemberOrigins: _hasLegacyMemberOrigins, ...storedValue } = value;
        return [
          key,
          {
            ...storedValue,
            memberStates: Object.fromEntries(value.memberStates || new Map())
          }
        ];
      })
    );
    await chrome.storage.local.set({
      [mgr.STORAGE_KEY]: serialized,
      [mgr.SESSION_TITLES_KEY]: Object.fromEntries(mgr.sessionGroupTitles.entries())
    });
  } catch (err) {
    // ignore
  }
}

export async function dismissStaticIndicatorsForGroup(
  mgr: TabGroupManager,
  chromeGroupId: number
): Promise<void> {
  const dismissedValue = (await chrome.storage.local.get(mgr.DISMISSED_GROUPS_KEY))[
    mgr.DISMISSED_GROUPS_KEY
  ];
  const dismissed = Array.isArray(dismissedValue)
    ? dismissedValue.filter((groupId): groupId is number => typeof groupId === 'number')
    : [];
  dismissed.includes(chromeGroupId) || dismissed.push(chromeGroupId);
  await chrome.storage.local.set({
    [mgr.DISMISSED_GROUPS_KEY]: dismissed
  });
  try {
    const tabs = await chrome.tabs.query({ groupId: chromeGroupId });
    for (const tab of tabs)
      if (tab.id)
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'HIDE_STATIC_INDICATOR'
          });
        } catch (err) {
          // ignore
        }
  } catch (err) {
    // ignore
  }
}

export async function isGroupDismissed(
  mgr: TabGroupManager,
  chromeGroupId: number
): Promise<boolean> {
  try {
    const dismissed = (await chrome.storage.local.get(mgr.DISMISSED_GROUPS_KEY))[
      mgr.DISMISSED_GROUPS_KEY
    ];
    return !!Array.isArray(dismissed) && dismissed.includes(chromeGroupId);
  } catch (err) {
    return false;
  }
}

export async function initialize(mgr: TabGroupManager, force = false): Promise<void> {
  if (mgr.initialized && !force) return;
  const firstInitOfLifetime = !mgr.initialized;
  await loadFromStorage(mgr);
  await mgr.reconcileWithChrome(firstInitOfLifetime);
  mgr.initialized = true;
}
