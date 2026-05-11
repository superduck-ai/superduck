import { StorageKeys } from '../../extensionServices';
import { DomainCategoryCache } from './domainCategory';
import { getTabEventManager } from './tabEvents';

const TAB_GROUP_TITLE = '🦆SuperDuck';
const MCP_TAB_GROUP_TITLE = '🦆SuperDuck (MCP)';

// =============================================================================
// Section 5: TabGroupManager
// =============================================================================

interface MemberState {
  indicatorState: string;
  previousIndicatorState?: string;
  isMcp?: boolean;
  pendingUpdate?: string;
}

interface GroupMetadata {
  mainTabId: number;
  createdAt: number;
  domain: string;
  chromeGroupId: number;
  memberStates: Map<number, MemberState>;
  isUnmanaged?: boolean;
}

interface GroupWithMembers extends GroupMetadata {
  memberTabs: GroupMemberTab[];
}

interface GroupMemberTab {
  tabId: number;
  url: string;
  title: string;
  joinedAt: number;
  indicatorState?: string;
}

interface GroupBlocklistStatus {
  groupId: number;
  mostRestrictiveCategory: string | undefined;
  categoriesByTab: Map<number, string | undefined>;
  blockedHtmlTabs: Set<number>;
  lastChecked: number;
}

interface StoredGroupMetadata extends Omit<GroupMetadata, 'memberStates'> {
  memberStates?: Record<string, MemberState>;
}

interface PendingRegroup {
  tabId: number;
  originalGroupId: number;
  indicatorState: string;
  metadata: GroupMetadata;
  attemptCount: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}

interface BlockedTabInfo {
  tabId: number;
  title: string;
  url: string;
  category: string;
}

class TabGroupManager {
  static instance: TabGroupManager;
  groupMetadata = new Map<number, GroupMetadata>();
  initialized = false;
  STORAGE_KEY = StorageKeys.TAB_GROUPS;
  groupBlocklistStatuses = new Map<number, GroupBlocklistStatus>();
  blocklistListeners = new Set<(groupId: number, category: string | undefined) => void>();
  indicatorUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  INDICATOR_UPDATE_DELAY = 100;
  pendingRegroups = new Map<number, PendingRegroup>();
  processingMainTabRemoval = new Set<number>();
  mcpTabGroupId: number | null = null;
  MCP_TAB_GROUP_KEY = StorageKeys.MCP_TAB_GROUP_ID;
  tabGroupListenerSubscriptionId: string | null = null;
  isTabGroupListenerStarted = false;
  DISMISSED_GROUPS_KEY = StorageKeys.DISMISSED_TAB_GROUPS;

  constructor() {
    this.startTabRemovalListener();
  }

  startTabRemovalListener(): void {
    chrome.tabs.onRemoved.addListener(async (tabId: number) => {
      for (const [groupId, status] of this.groupBlocklistStatuses.entries())
        status.categoriesByTab.has(tabId) &&
          (await this.removeTabFromBlocklistTracking(groupId, tabId));
    });
  }

  static getInstance(): TabGroupManager {
    return (
      TabGroupManager.instance || (TabGroupManager.instance = new TabGroupManager()),
      TabGroupManager.instance
    );
  }

  async dismissStaticIndicatorsForGroup(chromeGroupId: number): Promise<void> {
    const dismissedValue = (await chrome.storage.local.get(this.DISMISSED_GROUPS_KEY))[
      this.DISMISSED_GROUPS_KEY
    ];
    const dismissed = Array.isArray(dismissedValue)
      ? dismissedValue.filter((groupId): groupId is number => typeof groupId === 'number')
      : [];
    dismissed.includes(chromeGroupId) || dismissed.push(chromeGroupId);
    await chrome.storage.local.set({
      [this.DISMISSED_GROUPS_KEY]: dismissed
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

  async isGroupDismissed(chromeGroupId: number): Promise<boolean> {
    try {
      const dismissed = (await chrome.storage.local.get(this.DISMISSED_GROUPS_KEY))[
        this.DISMISSED_GROUPS_KEY
      ];
      return !!Array.isArray(dismissed) && dismissed.includes(chromeGroupId);
    } catch (err) {
      return false;
    }
  }

  async initialize(force = false): Promise<void> {
    (this.initialized && !force) ||
      (await this.loadFromStorage(), await this.reconcileWithChrome(), (this.initialized = true));
  }

  startTabGroupChangeListener(): void {
    if (this.isTabGroupListenerStarted) return;
    const eventManager = getTabEventManager();
    this.tabGroupListenerSubscriptionId = eventManager.subscribe(
      'all',
      ['groupId'],
      async (tabId: number, changeInfo: { groupId?: number }) => {
        if (typeof changeInfo.groupId === 'number') {
          await this.handleTabGroupChange(tabId, changeInfo.groupId);
        }
      }
    );
    this.isTabGroupListenerStarted = true;
  }

  stopTabGroupChangeListener(): void {
    if (!this.isTabGroupListenerStarted || !this.tabGroupListenerSubscriptionId) return;
    getTabEventManager().unsubscribe(this.tabGroupListenerSubscriptionId);
    this.tabGroupListenerSubscriptionId = null;
    this.isTabGroupListenerStarted = false;
  }

  async handleTabGroupChange(tabId: number, newGroupId: number): Promise<void> {
    for (const [mainTabId, meta] of this.groupMetadata.entries())
      if (meta.memberStates.has(tabId)) {
        if (
          newGroupId === chrome.tabGroups.TAB_GROUP_ID_NONE ||
          newGroupId !== meta.chromeGroupId
        ) {
          const memberState = meta.memberStates.get(tabId);
          const indicatorState = memberState?.indicatorState || 'none';
          try {
            let msgType = 'HIDE_AGENT_INDICATORS';
            'static' === indicatorState && (msgType = 'HIDE_STATIC_INDICATOR');
            await this.sendIndicatorMessage(tabId, msgType);
          } catch (err) {
            // ignore
          }
          if ((meta.memberStates.delete(tabId), tabId === mainTabId)) {
            if (this.processingMainTabRemoval.has(mainTabId)) return;
            if (this.pendingRegroups.has(mainTabId)) return;
            this.processingMainTabRemoval.add(mainTabId);
            const mainIndicatorState = meta.memberStates.get(mainTabId)?.indicatorState || 'none';
            const oldChromeGroupId = meta.chromeGroupId;
            try {
              const newChromeGroupId = await chrome.tabs.group({
                tabIds: [mainTabId]
              });
              if (
                (await chrome.tabGroups.update(newChromeGroupId, {
                  title: TAB_GROUP_TITLE,
                  color: chrome.tabGroups.Color.ORANGE,
                  collapsed: false
                }),
                (meta.chromeGroupId = newChromeGroupId),
                meta.memberStates.clear(),
                meta.memberStates.set(mainTabId, {
                  indicatorState: mainIndicatorState
                }),
                oldChromeGroupId !== newChromeGroupId &&
                  this.groupBlocklistStatuses.delete(oldChromeGroupId),
                'pulsing' === mainIndicatorState)
              )
                try {
                  await this.sendIndicatorMessage(mainTabId, 'SHOW_AGENT_INDICATORS');
                } catch (err) {
                  // ignore
                }
              return (
                this.groupMetadata.set(mainTabId, meta),
                await this.saveToStorage(),
                await this.cleanupOldGroup(oldChromeGroupId, mainTabId),
                void this.processingMainTabRemoval.delete(mainTabId)
              );
            } catch (err) {
              return err instanceof Error && err.message && err.message.includes('dragging')
                ? (this.pendingRegroups.set(mainTabId, {
                    tabId: mainTabId,
                    originalGroupId: oldChromeGroupId,
                    indicatorState: mainIndicatorState,
                    metadata: meta,
                    attemptCount: 0
                  }),
                  void this.scheduleRegroupRetry(mainTabId))
                : (this.groupMetadata.delete(mainTabId),
                  this.groupBlocklistStatuses.delete(oldChromeGroupId),
                  await this.saveToStorage(),
                  void this.processingMainTabRemoval.delete(mainTabId));
            }
          }
          await this.saveToStorage();
          break;
        }
      }
    if (newGroupId && newGroupId !== chrome.tabGroups.TAB_GROUP_ID_NONE)
      for (const [mainTabId, meta] of this.groupMetadata.entries())
        if (meta.chromeGroupId === newGroupId) {
          if (!meta.memberStates.has(tabId)) {
            const isSecondary = tabId !== mainTabId;
            meta.memberStates.set(tabId, {
              indicatorState: isSecondary ? 'static' : 'none'
            });
            try {
              const tab = await chrome.tabs.get(tabId);
              tab.url && (await this.updateTabBlocklistStatus(tabId, tab.url));
            } catch (err) {
              // ignore
            }
            const isDismissed = await this.isGroupDismissed(meta.chromeGroupId);
            if (isSecondary && !isDismissed) {
              let retryCount = 0;
              const maxRetries = 3;
              const retryDelay = 500;
              const tryShowIndicator = async (): Promise<boolean> => {
                try {
                  return (await this.sendIndicatorMessage(tabId, 'SHOW_STATIC_INDICATOR'), true);
                } catch (err) {
                  return (
                    retryCount++,
                    retryCount < maxRetries && setTimeout(tryShowIndicator, retryDelay),
                    false
                  );
                }
              };
              await tryShowIndicator();
            }
            await this.saveToStorage();
          }
          break;
        }
  }

  async cleanupOldGroup(oldGroupId: number, excludeTabId: number): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({ groupId: oldGroupId });
      for (const tab of tabs)
        if (tab.id && tab.id !== excludeTabId)
          try {
            await this.sendIndicatorMessage(tab.id, 'HIDE_STATIC_INDICATOR');
          } catch {
            // ignore
          }
      const tabIds = tabs.flatMap((tab) =>
        typeof tab.id === 'number' && tab.id !== excludeTabId ? [tab.id] : []
      );
      const [firstTabId, ...remainingTabIds] = tabIds;
      if (firstTabId !== undefined) {
        await chrome.tabs.ungroup([firstTabId, ...remainingTabIds]);
      }
    } catch (err) {
      // ignore
    }
  }

  scheduleRegroupRetry(tabId: number): void {
    const pending = this.pendingRegroups.get(tabId);
    pending &&
      (pending.timeoutId && clearTimeout(pending.timeoutId),
      (pending.timeoutId = setTimeout(() => {
        this.attemptRegroup(tabId);
      }, 1000)));
  }

  async attemptRegroup(tabId: number): Promise<void> {
    const pending = this.pendingRegroups.get(tabId);
    if (pending) {
      pending.attemptCount++;
      try {
        if ((await chrome.tabs.get(tabId)).groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE)
          return void this.pendingRegroups.delete(tabId);
        const newGroupId = await chrome.tabs.group({ tabIds: [tabId] });
        if (
          (await chrome.tabGroups.update(newGroupId, {
            title: TAB_GROUP_TITLE,
            color: chrome.tabGroups.Color.ORANGE,
            collapsed: false
          }),
          (pending.metadata.chromeGroupId = newGroupId),
          pending.metadata.memberStates.clear(),
          pending.metadata.memberStates.set(tabId, {
            indicatorState: pending.indicatorState
          }),
          pending.originalGroupId !== newGroupId &&
            this.groupBlocklistStatuses.delete(pending.originalGroupId),
          'pulsing' === pending.indicatorState)
        )
          try {
            await this.sendIndicatorMessage(tabId, 'SHOW_AGENT_INDICATORS');
          } catch (err) {
            // ignore
          }
        this.groupMetadata.set(tabId, pending.metadata);
        await this.saveToStorage();
        await this.cleanupOldGroup(pending.originalGroupId, tabId);
        this.pendingRegroups.delete(tabId);
        this.processingMainTabRemoval.delete(tabId);
      } catch {
        if (pending.attemptCount < 5) this.scheduleRegroupRetry(tabId);
        else {
          try {
            const newGroupId = await chrome.tabs.group({ tabIds: [tabId] });
            if (
              (await chrome.tabGroups.update(newGroupId, {
                title: TAB_GROUP_TITLE,
                color: chrome.tabGroups.Color.ORANGE,
                collapsed: false
              }),
              (pending.metadata.chromeGroupId = newGroupId),
              pending.metadata.memberStates.clear(),
              pending.metadata.memberStates.set(tabId, {
                indicatorState: pending.indicatorState
              }),
              pending.originalGroupId !== newGroupId &&
                this.groupBlocklistStatuses.delete(pending.originalGroupId),
              'pulsing' === pending.indicatorState)
            )
              try {
                await this.sendIndicatorMessage(tabId, 'SHOW_AGENT_INDICATORS');
              } catch (err) {
                // ignore
              }
            this.groupMetadata.set(tabId, pending.metadata);
            await this.saveToStorage();
            await this.cleanupOldGroup(pending.originalGroupId, tabId);
          } catch (err) {
            this.groupMetadata.delete(tabId);
            this.groupBlocklistStatuses.delete(pending.originalGroupId);
            await this.saveToStorage();
          }
          this.pendingRegroups.delete(tabId);
          this.processingMainTabRemoval.delete(tabId);
        }
      }
    }
  }

  async loadFromStorage(): Promise<void> {
    try {
      const data = (await chrome.storage.local.get(this.STORAGE_KEY))[this.STORAGE_KEY];
      data &&
        'object' == typeof data &&
        (this.groupMetadata = new Map(
          Object.entries(data as Record<string, StoredGroupMetadata>).map(([key, value]) => {
            const memberStates = value.memberStates
              ? new Map(
                  Object.entries(value.memberStates).map(([memberKey, memberValue]) => [
                    parseInt(memberKey, 10),
                    memberValue
                  ])
                )
              : new Map<number, MemberState>();
            const entry: GroupMetadata = {
              ...value,
              memberStates
            };
            return [parseInt(key, 10), entry];
          })
        ));
    } catch (err) {
      // ignore
    }
  }

  async saveToStorage(): Promise<void> {
    try {
      const serialized = Object.fromEntries(
        Array.from(this.groupMetadata.entries()).map(([key, value]) => [
          key,
          {
            ...value,
            memberStates: Object.fromEntries(value.memberStates || new Map())
          }
        ])
      );
      await chrome.storage.local.set({ [this.STORAGE_KEY]: serialized });
    } catch (err) {
      // ignore
    }
  }

  findMainTabInChromeGroup(chromeGroupId: number): number | null {
    for (const [mainTabId, meta] of this.groupMetadata.entries())
      if (meta.chromeGroupId === chromeGroupId) return mainTabId;
    return null;
  }

  async createGroup(tabId: number): Promise<GroupWithMembers> {
    const existing = await this.findGroupByMainTab(tabId);
    if (existing) return existing;
    const tab = await chrome.tabs.get(tabId);
    let chromeGroupId: number | undefined;
    let domain = 'blank';
    if (tab.url && '' !== tab.url && !tab.url.startsWith('chrome://'))
      try {
        domain = new URL(tab.url).hostname || 'blank';
      } catch {
        domain = 'blank';
      }
    if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      this.findMainTabInChromeGroup(tab.groupId) || (await chrome.tabs.ungroup([tabId]));
    }
    let retries = 3;
    for (; retries > 0; )
      try {
        chromeGroupId = await chrome.tabs.group({ tabIds: [tabId] });
        break;
      } catch (err) {
        if ((retries--, 0 === retries)) throw err;
        await new Promise((r) => setTimeout(r, 100));
      }
    if (!chromeGroupId) throw new Error('Failed to create Chrome tab group');
    await chrome.tabGroups.update(chromeGroupId, {
      title: TAB_GROUP_TITLE,
      color: chrome.tabGroups.Color.ORANGE,
      collapsed: false
    });
    const metadata: GroupMetadata = {
      mainTabId: tabId,
      createdAt: Date.now(),
      domain,
      chromeGroupId,
      memberStates: new Map()
    };
    metadata.memberStates.set(tabId, { indicatorState: 'none' });
    this.groupMetadata.set(tabId, metadata);
    await this.saveToStorage();
    const members = await this.getGroupMembers(chromeGroupId);
    return { ...metadata, memberTabs: members };
  }

  async adoptOrphanedGroup(tabId: number, chromeGroupId: number): Promise<GroupWithMembers> {
    const existing = await this.findGroupByMainTab(tabId);
    if (existing) return existing;
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) throw new Error('Tab has no URL');
    const domain = new URL(tab.url).hostname;
    if (tab.groupId !== chromeGroupId)
      throw new Error(`Tab ${tabId} is not in Chrome group ${chromeGroupId}`);
    const metadata: GroupMetadata = {
      mainTabId: tabId,
      createdAt: Date.now(),
      domain,
      chromeGroupId,
      memberStates: new Map()
    };
    metadata.memberStates.set(tabId, { indicatorState: 'none' });
    const groupTabs = await chrome.tabs.query({ groupId: chromeGroupId });
    for (const t of groupTabs)
      t.id && t.id !== tabId && metadata.memberStates.set(t.id, { indicatorState: 'static' });
    this.groupMetadata.set(tabId, metadata);
    await this.saveToStorage();
    const members = await this.getGroupMembers(chromeGroupId);
    return { ...metadata, memberTabs: members };
  }

  async addTabToGroup(mainTabId: number, tabId: number): Promise<void> {
    const meta = this.groupMetadata.get(mainTabId);
    if (meta) {
      try {
        await chrome.tabs.group({
          tabIds: [tabId],
          groupId: meta.chromeGroupId
        });
        meta.memberStates.has(tabId) ||
          meta.memberStates.set(tabId, {
            indicatorState: tabId === mainTabId ? 'none' : 'static'
          });
        try {
          const tab = await chrome.tabs.get(tabId);
          tab.url && (await this.updateTabBlocklistStatus(tabId, tab.url));
        } catch (err) {
          // ignore
        }
        const isDismissed = await this.isGroupDismissed(meta.chromeGroupId);
        if (tabId !== mainTabId && !isDismissed)
          try {
            await chrome.tabs.sendMessage(tabId, {
              type: 'SHOW_STATIC_INDICATOR'
            });
          } catch {
            // ignore
          }
      } catch (err) {
        // ignore
      }
      await this.saveToStorage();
    }
  }

  async getGroupMembers(chromeGroupId: number): Promise<GroupMemberTab[]> {
    const tabs = await chrome.tabs.query({ groupId: chromeGroupId });
    let matchingMeta: GroupMetadata | undefined;
    for (const [, meta] of this.groupMetadata.entries())
      if (meta.chromeGroupId === chromeGroupId) {
        matchingMeta = meta;
        break;
      }
    return tabs
      .flatMap((tab) => {
        if (typeof tab.id !== 'number') {
          return [];
        }

        const state = matchingMeta?.memberStates.get(tab.id);
        return [
          {
            tabId: tab.id,
            url: tab.url || '',
            title: tab.title || '',
            joinedAt: Date.now(),
            indicatorState: state?.indicatorState || 'none'
          }
        ];
      });
  }

  async getGroupDetails(mainTabId: number): Promise<GroupWithMembers> {
    const meta = this.groupMetadata.get(mainTabId);
    if (!meta) throw new Error(`No group found for main tab ${mainTabId}`);
    const members = await this.getGroupMembers(meta.chromeGroupId);
    return { ...meta, memberTabs: members };
  }

  async findOrphanedTabs(): Promise<
    {
      tabId: number;
      url: string;
      title: string;
      openerTabId: number;
      detectedAt: number;
    }[]
  > {
    const orphaned: {
      tabId: number;
      url: string;
      title: string;
      openerTabId: number;
      detectedAt: number;
    }[] = [];
    const seen = new Set<number>();
    const ungroupedTabs = await chrome.tabs.query({
      groupId: chrome.tabGroups.TAB_GROUP_ID_NONE
    });
    const knownTabIds = new Set<number>();
    for (const [mainTabId] of this.groupMetadata.entries()) {
      knownTabIds.add(mainTabId);
      const group = await this.findGroupByMainTab(mainTabId);
      group && group.memberTabs.forEach((m) => knownTabIds.add(m.tabId));
    }
    for (const tab of ungroupedTabs) {
      if (!tab.id || seen.has(tab.id) || knownTabIds.has(tab.id)) continue;
      seen.add(tab.id);
      tab.openerTabId &&
        knownTabIds.has(tab.openerTabId) &&
        tab.url &&
        !tab.url.startsWith('chrome://') &&
        !tab.url.startsWith('chrome-extension://') &&
        !('about:blank' === tab.url) &&
        orphaned.push({
          tabId: tab.id,
          url: tab.url || '',
          title: tab.title || '',
          openerTabId: tab.openerTabId,
          detectedAt: Date.now()
        });
    }
    return orphaned;
  }

  async reconcileWithChrome(): Promise<void> {
    const allTabs = await chrome.tabs.query({});
    const activeGroupIds = new Set<number>();
    for (const tab of allTabs)
      tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE && activeGroupIds.add(tab.groupId);
    const toRemove: number[] = [];
    let changed = false;
    for (const [mainTabId, meta] of this.groupMetadata.entries())
      try {
        const tab = await chrome.tabs.get(mainTabId);
        if (activeGroupIds.has(meta.chromeGroupId))
          if (tab.groupId !== meta.chromeGroupId) toRemove.push(mainTabId);
          else {
            const groupTabs = await chrome.tabs.query({
              groupId: meta.chromeGroupId
            });
            const currentTabIds = new Set(groupTabs.map((t) => t.id).filter((id) => void 0 !== id));
            const staleMembers: number[] = [];
            for (const [memberId] of meta.memberStates)
              currentTabIds.has(memberId) || staleMembers.push(memberId);
            if (staleMembers.length > 0) {
              for (const id of staleMembers) {
                meta.memberStates.delete(id);
                try {
                  await this.sendIndicatorMessage(id, 'HIDE_AGENT_INDICATORS');
                } catch {
                  // ignore
                }
              }
              changed = true;
            }
          }
        else toRemove.push(mainTabId);
      } catch {
        toRemove.push(mainTabId);
      }
    for (const id of toRemove) this.groupMetadata.delete(id);
    (toRemove.length > 0 || changed) && (await this.saveToStorage());
  }

  async getAllGroups(): Promise<GroupWithMembers[]> {
    await this.initialize();
    const groups: GroupWithMembers[] = [];
    for (const [, meta] of this.groupMetadata.entries())
      try {
        const members = await this.getGroupMembers(meta.chromeGroupId);
        groups.push({ ...meta, memberTabs: members });
      } catch (err) {
        // ignore
      }
    return groups;
  }

  async findGroupByTab(tabId: number): Promise<GroupWithMembers | null> {
    await this.initialize();
    const meta = this.groupMetadata.get(tabId);
    if (meta) {
      const members = await this.getGroupMembers(meta.chromeGroupId);
      return { ...meta, memberTabs: members };
    }
    const tab = await chrome.tabs.get(tabId);
    if (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return null;
    for (const [, groupMeta] of this.groupMetadata.entries())
      if (groupMeta.chromeGroupId === tab.groupId) {
        const members = await this.getGroupMembers(groupMeta.chromeGroupId);
        return { ...groupMeta, memberTabs: members };
      }
    const groupTabs = await chrome.tabs.query({ groupId: tab.groupId });
    if (0 === groupTabs.length) return null;
    groupTabs.sort((a, b) => a.index - b.index);
    const firstTab = groupTabs[0];
    if (!firstTab.id || !firstTab.url) return null;
    return {
      mainTabId: firstTab.id,
      createdAt: Date.now(),
      domain: new URL(firstTab.url).hostname,
      chromeGroupId: tab.groupId,
      memberStates: new Map(),
      memberTabs: groupTabs.flatMap((groupTab) =>
        typeof groupTab.id === 'number'
          ? [
              {
                tabId: groupTab.id,
                url: groupTab.url || '',
                title: groupTab.title || '',
                joinedAt: Date.now()
              }
            ]
          : []
      ),
      isUnmanaged: true
    };
  }

  async findGroupByMainTab(mainTabId: number): Promise<GroupWithMembers | null> {
    await this.initialize();
    const meta = this.groupMetadata.get(mainTabId);
    if (!meta) return null;
    try {
      const members = await this.getGroupMembers(meta.chromeGroupId);
      return { ...meta, memberTabs: members };
    } catch (err) {
      return null;
    }
  }

  async isInGroup(tabId: number): Promise<boolean> {
    return null !== (await this.findGroupByTab(tabId));
  }

  isMainTab(tabId: number): boolean {
    return this.groupMetadata.has(tabId);
  }

  async getMainTabId(tabId: number): Promise<number | null> {
    const group = await this.findGroupByTab(tabId);
    return group?.mainTabId || null;
  }

  async promoteToMainTab(oldMainTabId: number, newMainTabId: number): Promise<void> {
    const meta = this.groupMetadata.get(oldMainTabId);
    if (!meta) throw new Error(`No group found for main tab ${oldMainTabId}`);
    if ((await chrome.tabs.get(newMainTabId)).groupId !== meta.chromeGroupId)
      throw new Error(`Tab ${newMainTabId} is not in the same group as ${oldMainTabId}`);
    const oldState = meta.memberStates.get(oldMainTabId) || {
      indicatorState: 'none'
    };
    try {
      await chrome.tabs.get(oldMainTabId);
      'pulsing' === oldState.indicatorState &&
        (await this.sendIndicatorMessage(oldMainTabId, 'HIDE_AGENT_INDICATORS'));
    } catch {
      // ignore
    }
    meta.memberStates.get(newMainTabId);
    meta.mainTabId = newMainTabId;
    try {
      await this.sendIndicatorMessage(newMainTabId, 'HIDE_STATIC_INDICATOR');
      meta.memberStates.delete(newMainTabId);
    } catch (err) {
      // ignore
    }
    'pulsing' === oldState.indicatorState
      ? (meta.memberStates.set(newMainTabId, { indicatorState: 'pulsing' }),
        await this.sendIndicatorMessage(newMainTabId, 'SHOW_AGENT_INDICATORS'))
      : meta.memberStates.set(newMainTabId, { indicatorState: 'none' });
    this.groupMetadata.delete(oldMainTabId);
    this.groupMetadata.set(newMainTabId, meta);
    await this.saveToStorage();
  }

  async deleteGroup(mainTabId: number): Promise<void> {
    const meta = this.groupMetadata.get(mainTabId);
    if (meta) {
      try {
        const tabs = await chrome.tabs.query({
          groupId: meta.chromeGroupId
        });
        const tabIds = tabs.map((t) => t.id).filter((id) => void 0 !== id) as number[];
        if (tabIds.length > 0)
          try {
            for (const tab of tabs)
              if (tab.id)
                try {
                  await chrome.tabs.sendMessage(tab.id, {
                    type: 'HIDE_AGENT_INDICATORS'
                  });
                  await chrome.tabs.sendMessage(tab.id, {
                    type: 'HIDE_STATIC_INDICATOR'
                  });
                } catch {
                  // ignore
                }
          } catch (err) {
            // ignore
          }
        await new Promise((r) => setTimeout(r, 100));
        tabIds.length > 0 && (await chrome.tabs.ungroup(tabIds as [number, ...number[]]));
      } catch (err) {
        // ignore
      }
      this.groupMetadata.delete(mainTabId);
      await this.saveToStorage();
    }
  }

  async clearAllGroups(): Promise<void> {
    const keys = Array.from(this.groupMetadata.keys());
    for (const key of keys) await this.deleteGroup(key);
    this.groupMetadata.clear();
    await this.saveToStorage();
  }

  async clearAll(): Promise<void> {
    await this.clearAllGroups();
    this.initialized = false;
  }

  async handleTabClosed(tabId: number): Promise<void> {
    this.groupMetadata.has(tabId) && (await this.deleteGroup(tabId));
  }

  async getGroup(mainTabId: number): Promise<GroupWithMembers | undefined> {
    return (await this.findGroupByMainTab(mainTabId)) || void 0;
  }

  async updateTabBlocklistStatus(tabId: number, url: string): Promise<void> {
    const group = await this.findGroupByTab(tabId);
    if (!group) return;
    const isBlockedHtml = url.includes('blocked.html');
    const category = isBlockedHtml ? 'category1' : await DomainCategoryCache.getCategory(url);
    await this.updateGroupBlocklistStatus(group.chromeGroupId, tabId, category, isBlockedHtml);
  }

  async removeTabFromBlocklistTracking(groupId: number, tabId: number): Promise<void> {
    const status = this.groupBlocklistStatuses.get(groupId);
    status &&
      (status.categoriesByTab.delete(tabId),
      status.blockedHtmlTabs.delete(tabId),
      await this.recalculateGroupBlocklistStatus(groupId));
  }

  async updateGroupBlocklistStatus(
    groupId: number,
    tabId: number,
    category: string | undefined,
    isBlockedHtml = false
  ): Promise<void> {
    let status = this.groupBlocklistStatuses.get(groupId);
    status ||
      ((status = {
        groupId,
        mostRestrictiveCategory: void 0,
        categoriesByTab: new Map(),
        blockedHtmlTabs: new Set(),
        lastChecked: Date.now()
      }),
      this.groupBlocklistStatuses.set(groupId, status));
    status.categoriesByTab.set(tabId, category);
    isBlockedHtml ? status.blockedHtmlTabs.add(tabId) : status.blockedHtmlTabs.delete(tabId);
    await this.recalculateGroupBlocklistStatus(groupId);
  }

  async recalculateGroupBlocklistStatus(groupId: number): Promise<void> {
    const status = this.groupBlocklistStatuses.get(groupId);
    if (!status) return;
    const previousCategory = status.mostRestrictiveCategory;
    const categories = Array.from(status.categoriesByTab.values());
    status.mostRestrictiveCategory = this.getMostRestrictiveCategory(categories);
    status.lastChecked = Date.now();
    previousCategory !== status.mostRestrictiveCategory &&
      this.notifyBlocklistListeners(groupId, status.mostRestrictiveCategory);
  }

  getMostRestrictiveCategory(categories: (string | undefined)[]): string | undefined {
    const weights: Record<string, number> = {
      category3: 2,
      category2: 3,
      category_org_blocked: 3,
      category1: 4,
      category0: 1
    };
    let result: string | undefined;
    let maxWeight = 0;
    for (const cat of categories)
      cat && weights[cat] > maxWeight && ((maxWeight = weights[cat]), (result = cat));
    return result;
  }

  async getGroupBlocklistStatus(mainTabId: number): Promise<string | undefined> {
    await this.initialize();
    const group = await this.findGroupByMainTab(mainTabId);
    if (!group) {
      const tab = await chrome.tabs.get(mainTabId);
      return await DomainCategoryCache.getCategory(tab.url || '');
    }
    const status = this.groupBlocklistStatuses.get(group.chromeGroupId);
    (!status || Date.now() - status.lastChecked > 5000) &&
      (await this.checkAllTabsInGroupForBlocklist(group.chromeGroupId));
    return this.groupBlocklistStatuses.get(group.chromeGroupId)?.mostRestrictiveCategory;
  }

  async getBlockedTabsInfo(
    mainTabId: number
  ): Promise<{ isMainTabBlocked: boolean; blockedTabs: BlockedTabInfo[] }> {
    await this.initialize();
    const group = await this.findGroupByMainTab(mainTabId);
    const blockedTabs: BlockedTabInfo[] = [];
    let isMainTabBlocked = false;
    if (!group) {
      const tab = await chrome.tabs.get(mainTabId);
      if (tab.url?.includes('blocked.html'))
        ((isMainTabBlocked = true),
          blockedTabs.push({
            tabId: mainTabId,
            title: tab.title || 'Untitled',
            url: tab.url || '',
            category: 'category1'
          }));
      else {
        const category = await DomainCategoryCache.getCategory(tab.url || '');
        category &&
          'category0' !== category &&
          ((isMainTabBlocked = true),
          blockedTabs.push({
            tabId: mainTabId,
            title: tab.title || 'Untitled',
            url: tab.url || '',
            category
          }));
      }
      return { isMainTabBlocked, blockedTabs };
    }
    const status = this.groupBlocklistStatuses.get(group.chromeGroupId);
    (!status || Date.now() - status.lastChecked > 5000) &&
      (await this.checkAllTabsInGroupForBlocklist(group.chromeGroupId));
    const currentStatus = this.groupBlocklistStatuses.get(group.chromeGroupId);
    if (!currentStatus) return { isMainTabBlocked, blockedTabs };
    for (const blockedTabId of currentStatus.blockedHtmlTabs)
      try {
        const tab = await chrome.tabs.get(blockedTabId);
        blockedTabs.push({
          tabId: blockedTabId,
          title: tab.title || 'Untitled',
          url: tab.url || '',
          category: 'category1'
        });
        blockedTabId === mainTabId && (isMainTabBlocked = true);
      } catch {
        // ignore
      }
    for (const [catTabId, category] of currentStatus.categoriesByTab.entries())
      if (
        category &&
        ('category1' === category ||
          'category2' === category ||
          'category_org_blocked' === category) &&
        !currentStatus.blockedHtmlTabs.has(catTabId)
      )
        try {
          const tab = await chrome.tabs.get(catTabId);
          blockedTabs.push({
            tabId: catTabId,
            title: tab.title || 'Untitled',
            url: tab.url || '',
            category
          });
          catTabId === mainTabId && (isMainTabBlocked = true);
        } catch {
          // ignore
        }
    return { isMainTabBlocked, blockedTabs };
  }

  async checkAllTabsInGroupForBlocklist(chromeGroupId: number): Promise<void> {
    const tabs = await chrome.tabs.query({ groupId: chromeGroupId });
    const status: GroupBlocklistStatus = {
      groupId: chromeGroupId,
      mostRestrictiveCategory: void 0,
      categoriesByTab: new Map(),
      blockedHtmlTabs: new Set(),
      lastChecked: Date.now()
    };
    for (const tab of tabs)
      if (tab.id && tab.url)
        if (tab.url.includes('blocked.html'))
          (status.blockedHtmlTabs.add(tab.id), status.categoriesByTab.set(tab.id, 'category1'));
        else {
          const category = await DomainCategoryCache.getCategory(tab.url);
          status.categoriesByTab.set(tab.id, category);
        }
    status.mostRestrictiveCategory = this.getMostRestrictiveCategory(
      Array.from(status.categoriesByTab.values())
    );
    this.groupBlocklistStatuses.set(chromeGroupId, status);
    this.notifyBlocklistListeners(chromeGroupId, status.mostRestrictiveCategory);
  }

  addBlocklistListener(listener: (groupId: number, category: string | undefined) => void): void {
    this.blocklistListeners.add(listener);
  }

  removeBlocklistListener(listener: (groupId: number, category: string | undefined) => void): void {
    this.blocklistListeners.delete(listener);
  }

  notifyBlocklistListeners(groupId: number, category: string | undefined): void {
    for (const listener of this.blocklistListeners)
      try {
        listener(groupId, category);
      } catch (err) {
        // ignore
      }
  }

  clearBlocklistCache(): void {
    this.groupBlocklistStatuses.clear();
  }

  async isTabInSameGroup(tabId1: number, tabId2: number): Promise<boolean> {
    try {
      await this.initialize();
      const mainTabId = await this.getMainTabId(tabId1);
      if (!mainTabId) return tabId1 === tabId2;
      return mainTabId === (await this.getMainTabId(tabId2));
    } catch (err) {
      return false;
    }
  }

  async getValidTabIds(tabId: number): Promise<number[]> {
    try {
      await this.initialize();
      const mainTabId = await this.getMainTabId(tabId);
      if (!mainTabId) return [tabId];
      return (await this.getGroupDetails(mainTabId)).memberTabs.map((m) => m.tabId);
    } catch (err) {
      return [tabId];
    }
  }

  async getValidTabsWithMetadata(
    tabId: number
  ): Promise<{ id: number; title: string; url: string }[]> {
    try {
      const tabIds = await this.getValidTabIds(tabId);
      return await Promise.all(
        tabIds.map(async (id) => {
          try {
            const tab = await chrome.tabs.get(id);
            return { id, title: tab.title || 'Untitled', url: tab.url || '' };
          } catch (err) {
            return { id, title: 'Error loading tab', url: '' };
          }
        })
      );
    } catch (err) {
      try {
        const tab = await chrome.tabs.get(tabId);
        return [{ id: tabId, title: tab.title || 'Untitled', url: tab.url || '' }];
      } catch {
        return [{ id: tabId, title: 'Error loading tab', url: '' }];
      }
    }
  }

  async getEffectiveTabId(
    requestedTabId: number | undefined,
    currentTabId: number
  ): Promise<number> {
    if (void 0 === requestedTabId) return currentTabId;
    if (!(await this.isTabInSameGroup(currentTabId, requestedTabId))) {
      const validIds = await this.getValidTabIds(currentTabId);
      throw new Error(
        `Tab ${requestedTabId} is not in the same group as the current tab. Valid tab IDs are: ${validIds.join(', ')}`
      );
    }
    return requestedTabId;
  }

  async setTabIndicatorState(tabId: number, state: string, isMcp?: boolean): Promise<void> {
    let chromeGroupId: number | undefined;
    let found = false;
    for (const [, meta] of this.groupMetadata.entries()) {
      if ((await this.getGroupMembers(meta.chromeGroupId)).some((m) => m.tabId === tabId)) {
        chromeGroupId = meta.chromeGroupId;
        if ('static' === state && (await this.isGroupDismissed(chromeGroupId))) return;
        const existing = meta.memberStates.get(tabId);
        meta.memberStates.set(tabId, {
          indicatorState: state,
          previousIndicatorState: existing?.indicatorState,
          isMcp: isMcp ?? existing?.isMcp
        });
        found = true;
        break;
      }
    }
    this.queueIndicatorUpdate(tabId, state);
  }

  async setGroupIndicatorState(mainTabId: number, state: string): Promise<void> {
    const group = await this.getGroupDetails(mainTabId);
    'pulsing' === state
      ? await this.setTabIndicatorState(mainTabId, 'pulsing')
      : await this.setTabIndicatorState(mainTabId, state);
    for (const member of group.memberTabs)
      if (member.tabId !== mainTabId) {
        const memberState = 'none' === state ? 'none' : 'static';
        await this.setTabIndicatorState(member.tabId, memberState);
      }
  }

  getTabIndicatorState(tabId: number): string {
    for (const [, meta] of this.groupMetadata.entries()) {
      const state = meta.memberStates.get(tabId);
      if (state) return state.indicatorState;
    }
    return 'none';
  }

  async showSecondaryTabIndicators(mainTabId: number): Promise<void> {
    const group = await this.getGroupDetails(mainTabId);
    if (await this.isGroupDismissed(group.chromeGroupId)) return;
    for (const member of group.memberTabs)
      member.tabId !== mainTabId && (await this.setTabIndicatorState(member.tabId, 'static'));
    await this.processIndicatorQueue();
  }

  async showStaticIndicatorsForChromeGroup(chromeGroupId: number): Promise<void> {
    if (await this.isGroupDismissed(chromeGroupId)) return;
    const tabs = await chrome.tabs.query({ groupId: chromeGroupId });
    if (0 === tabs.length) return;
    let mainTabId: number | undefined;
    for (const [id, meta] of this.groupMetadata.entries())
      if (meta.chromeGroupId === chromeGroupId) {
        mainTabId = id;
        break;
      }
    mainTabId || (tabs.sort((a, b) => a.index - b.index), (mainTabId = tabs[0].id));
    for (const tab of tabs)
      if (tab.id && tab.id !== mainTabId)
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'SHOW_STATIC_INDICATOR'
          });
        } catch (err) {
          // ignore
        }
  }

  async hideSecondaryTabIndicators(mainTabId: number): Promise<void> {
    try {
      const group = await this.getGroupDetails(mainTabId);
      for (const member of group.memberTabs)
        member.tabId !== mainTabId && (await this.setTabIndicatorState(member.tabId, 'none'));
      await this.processIndicatorQueue();
    } catch (err) {
      // ignore
    }
  }

  async hideIndicatorForToolUse(tabId: number): Promise<void> {
    try {
      const currentState = this.getTabIndicatorState(tabId);
      for (const [, meta] of this.groupMetadata.entries()) {
        const memberState = meta.memberStates.get(tabId);
        if (memberState) {
          memberState.previousIndicatorState = currentState;
          memberState.indicatorState = 'hidden_for_screenshot';
          break;
        }
      }
      await this.sendIndicatorMessage(tabId, 'HIDE_FOR_TOOL_USE');
    } catch (err) {
      // ignore
    }
  }

  async restoreIndicatorAfterToolUse(tabId: number): Promise<void> {
    try {
      for (const [, meta] of this.groupMetadata.entries()) {
        const memberState = meta.memberStates.get(tabId);
        if (memberState && void 0 !== memberState.previousIndicatorState) {
          const previousState = memberState.previousIndicatorState;
          if (
            ((memberState.indicatorState = previousState),
            delete memberState.previousIndicatorState,
            'static' === previousState)
          ) {
            if (await this.isGroupDismissed(meta.chromeGroupId)) return;
          }
          let messageType: string;
          switch (previousState) {
            case 'pulsing':
              messageType = 'SHOW_AFTER_TOOL_USE';
              break;
            case 'static':
              messageType = 'SHOW_AFTER_TOOL_USE';
              break;
            case 'none':
              return;
            default:
              messageType = 'SHOW_AFTER_TOOL_USE';
          }
          await this.sendIndicatorMessage(tabId, messageType);
          break;
        }
      }
    } catch (err) {
      // ignore
    }
  }

  async startRunning(mainTabId: number): Promise<void> {
    await this.setGroupIndicatorState(mainTabId, 'pulsing');
  }

  async stopRunning(): Promise<void> {
    for (const [, meta] of this.groupMetadata.entries())
      for (const [tabId] of meta.memberStates) await this.setTabIndicatorState(tabId, 'none');
    await this.processIndicatorQueue();
  }

  async updateGroupTitle(mainTabId: number, title: string, isLoading = false): Promise<void> {
    if (!title || '' === title.trim()) return;
    const meta = this.groupMetadata.get(mainTabId);
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
        const displayTitle = isLoading ? `\u231B${title.trim()}` : title.trim();
        await chrome.tabGroups.update(meta.chromeGroupId, {
          title: displayTitle,
          color: chosenColor
        });
      } catch (err) {
        // ignore
      }
  }

  async updateTabGroupPrefix(
    mainTabId: number,
    prefix: string | null,
    removePrefix?: string
  ): Promise<void> {
    const meta = this.groupMetadata.get(mainTabId);
    if (!meta) return;
    let retryCount = 0;
    const prefixPattern = /^(\u231B|\uD83D\uDD14|\u2705)/;
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

  async addCompletionPrefix(mainTabId: number): Promise<void> {
    await this.updateTabGroupPrefix(mainTabId, '\u2705');
  }

  async addLoadingPrefix(mainTabId: number): Promise<void> {
    await this.updateTabGroupPrefix(mainTabId, '\u231B');
  }

  async addPermissionPrefix(mainTabId: number): Promise<void> {
    await this.updateTabGroupPrefix(mainTabId, '\uD83D\uDD14');
  }

  async removeCompletionPrefix(mainTabId: number): Promise<void> {
    await this.updateTabGroupPrefix(mainTabId, null, '\u2705');
  }

  async removePrefix(mainTabId: number): Promise<void> {
    await this.updateTabGroupPrefix(mainTabId, null);
  }

  async addTabToIndicatorGroup(options: {
    tabId: number;
    isRunning: boolean;
    isMcp?: boolean;
  }): Promise<void> {
    const { tabId, isRunning, isMcp } = options;
    let state: string;
    state = this.isMainTab(tabId) && isRunning ? 'pulsing' : 'static';
    await this.setTabIndicatorState(tabId, state, isMcp);
  }

  async getTabForMcp(
    tabId?: number,
    tabGroupId?: number
  ): Promise<{
    tabId: number | undefined;
    domain?: string;
    url?: string;
  }> {
    if ((await this.initialize(), await this.loadMcpTabGroupId(), void 0 !== tabId))
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab) {
          const group = await this.findGroupByTab(tabId);
          let domain: string | undefined;
          group &&
            ((this.mcpTabGroupId = group.chromeGroupId),
            await this.saveMcpTabGroupId(),
            await this.ensureMcpGroupCharacteristics(group.chromeGroupId));
          const tabUrl = tab.url && !tab.url.startsWith('chrome://') ? tab.url : void 0;
          if (tabUrl)
            try {
              domain = new URL(tabUrl).hostname || void 0;
            } catch {
              // ignore
            }
          return { tabId, domain, url: tabUrl };
        }
      } catch {
        throw new Error(`Tab ${tabId} does not exist`);
      }
    if (void 0 !== tabGroupId) {
      for (const [mainId, meta] of this.groupMetadata.entries())
        if (meta.chromeGroupId === tabGroupId)
          try {
            const tab = await chrome.tabs.get(mainId);
            if (tab) {
              const tabUrl = tab.url && !tab.url.startsWith('chrome://') ? tab.url : void 0;
              return { tabId: mainId, domain: meta.domain, url: tabUrl };
            }
          } catch {
            break;
          }
      try {
        const tabs = await chrome.tabs.query({ groupId: tabGroupId });
        if (tabs.length > 0 && tabs[0].id) {
          let domain: string | undefined;
          const tabUrl = tabs[0].url;
          const url = tabUrl && !tabUrl.startsWith('chrome://') ? tabUrl : void 0;
          if (url)
            try {
              domain = new URL(url).hostname || void 0;
            } catch {
              // ignore
            }
          return { tabId: tabs[0].id, domain, url };
        }
      } catch (err) {
        // ignore
      }
      throw new Error(`Could not find tab group ${tabGroupId}`);
    }
    return { tabId: void 0 };
  }

  async isTabMcp(tabId: number): Promise<boolean> {
    if (
      !(
        true ===
        (await chrome.storage.local.get(StorageKeys.MCP_CONNECTED))[StorageKeys.MCP_CONNECTED]
      )
    )
      return false;
    if ((await this.loadMcpTabGroupId(), null === this.mcpTabGroupId)) return false;
    for (const [, meta] of this.groupMetadata.entries())
      if (meta.chromeGroupId === this.mcpTabGroupId && meta.memberStates.has(tabId)) return true;
    return false;
  }

  async ensureMcpGroupCharacteristics(chromeGroupId: number): Promise<void> {
    try {
      const group = await chrome.tabGroups.get(chromeGroupId);
      (group.title === MCP_TAB_GROUP_TITLE && group.color === chrome.tabGroups.Color.YELLOW) ||
        (await chrome.tabGroups.update(chromeGroupId, {
          title: MCP_TAB_GROUP_TITLE,
          color: chrome.tabGroups.Color.YELLOW
        }));
    } catch (err) {
      // ignore
    }
  }

  async clearMcpTabGroup(): Promise<void> {
    this.mcpTabGroupId = null;
    await chrome.storage.local.remove(this.MCP_TAB_GROUP_KEY as string);
  }

  async getOrCreateMcpTabContext(options?: { createIfEmpty?: boolean }): Promise<
    | {
        currentTabId: number;
        availableTabs: { id: number; title: string; url: string }[];
        tabCount: number;
        tabGroupId: number;
      }
    | undefined
  > {
    const { createIfEmpty = false } = options || {};
    if ((await this.loadMcpTabGroupId(), null !== this.mcpTabGroupId))
      try {
        await chrome.tabGroups.get(this.mcpTabGroupId);
        await this.ensureMcpGroupCharacteristics(this.mcpTabGroupId);
        const tabs = (await chrome.tabs.query({ groupId: this.mcpTabGroupId })).flatMap((tab) =>
          typeof tab.id === 'number'
            ? [
                {
                  id: tab.id,
                  title: tab.title || '',
                  url: tab.url || ''
                }
              ]
            : []
        );
        if (tabs.length > 0)
          return {
            currentTabId: tabs[0].id,
            availableTabs: tabs,
            tabCount: tabs.length,
            tabGroupId: this.mcpTabGroupId
          };
      } catch {
        this.mcpTabGroupId = null;
        await this.saveMcpTabGroupId();
      }
    if (createIfEmpty) {
      const win = await chrome.windows.create({
        url: 'chrome://newtab',
        focused: true,
        type: 'normal'
      });
      const newTabId = win?.tabs?.[0]?.id;
      if (!newTabId) throw new Error('Failed to create window with new tab');
      const group = await this.createGroup(newTabId);
      return (
        await chrome.tabGroups.update(group.chromeGroupId, {
          title: MCP_TAB_GROUP_TITLE,
          color: chrome.tabGroups.Color.YELLOW
        }),
        (this.mcpTabGroupId = group.chromeGroupId),
        await this.saveMcpTabGroupId(),
        {
          currentTabId: newTabId,
          availableTabs: [{ id: newTabId, title: 'New Tab', url: 'chrome://newtab' }],
          tabCount: 1,
          tabGroupId: group.chromeGroupId
        }
      );
    }
  }

  async saveMcpTabGroupId(): Promise<void> {
    await chrome.storage.local.set({
      [this.MCP_TAB_GROUP_KEY]: this.mcpTabGroupId
    });
  }

  async loadMcpTabGroupId(): Promise<void> {
    try {
      const stored = (await chrome.storage.local.get(this.MCP_TAB_GROUP_KEY))[
        this.MCP_TAB_GROUP_KEY
      ];
      if ('number' == typeof stored)
        try {
          return (await chrome.tabGroups.get(stored), void (this.mcpTabGroupId = stored));
        } catch {
          // ignore
        }
      const found = await this.findMcpTabGroupByCharacteristics();
      if (null !== found)
        return ((this.mcpTabGroupId = found), void (await this.saveMcpTabGroupId()));
      this.mcpTabGroupId = null;
    } catch (err) {
      this.mcpTabGroupId = null;
    }
  }

  async findMcpTabGroupByCharacteristics(): Promise<number | null> {
    try {
      const groups = await chrome.tabGroups.query({});
      for (const group of groups)
        if (
          group.color === chrome.tabGroups.Color.YELLOW &&
          group.title?.includes(MCP_TAB_GROUP_TITLE)
        ) {
          if ((await chrome.tabs.query({ groupId: group.id })).length > 0) return group.id;
        }
      return null;
    } catch (err) {
      return null;
    }
  }

  queueIndicatorUpdate(tabId: number, state: string): void {
    for (const [, meta] of this.groupMetadata.entries()) {
      const memberState = meta.memberStates.get(tabId);
      if (memberState) {
        memberState.pendingUpdate = state;
        break;
      }
    }
    this.indicatorUpdateTimer && clearTimeout(this.indicatorUpdateTimer);
    this.indicatorUpdateTimer = setTimeout(() => {
      this.processIndicatorQueue();
    }, this.INDICATOR_UPDATE_DELAY);
  }

  async processIndicatorQueue(): Promise<void> {
    for (const [, meta] of this.groupMetadata.entries())
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
              // Hide both indicator types — the tab may have had pulsing OR static
              // indicators; both hide handlers are idempotent so double-sending is safe
              await this.sendIndicatorMessage(tabId, 'HIDE_AGENT_INDICATORS', memberState.isMcp);
              messageType = 'HIDE_STATIC_INDICATOR';
              break;
            default:
              continue;
          }
          await this.sendIndicatorMessage(tabId, messageType, memberState.isMcp);
          delete memberState.pendingUpdate;
        }
  }

  async sendIndicatorMessage(tabId: number, messageType: string, isMcp?: boolean): Promise<void> {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: messageType,
        isMcp
      });
    } catch {
      // Expected when the content script is not loaded in the target tab
      // (e.g. tab just opened, navigated away, or on a restricted page).
    }
  }
}

export const tabGroupManager = TabGroupManager.getInstance();
