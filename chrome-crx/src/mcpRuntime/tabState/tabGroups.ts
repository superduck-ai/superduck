import { StorageKeys } from '../../extensionServices';
import {
  type GroupMetadata,
  type GroupWithMembers,
  type GroupMemberTab,
  type GroupBlocklistStatus,
  type PendingRegroup,
  type BlockedTabInfo,
  type CreateGroupOptions,
  type AddTabToGroupOptions,
  type FinalizeManagedGroupOptions,
  type FinalizeTabsKeep,
  type FinalizedTabContext
} from './types';

import * as blocklist from './tabGroupBlocklist';
import * as prefixMod from './tabGroupPrefix';
import * as mcp from './mcpTabGroup';
import * as indicators from './tabGroupIndicators';
import * as storage from './tabGroupStorage';
import * as queries from './tabGroupQueries';
import * as lifecycle from './tabGroupLifecycle';
import * as regroup from './tabGroupRegroup';
import * as reconcile from './tabGroupReconcile';
import * as promotion from './tabGroupPromotion';
import { recordEvent, recordError } from '../../debug';
import * as validation from './tabGroupValidation';
import * as navIsolation from './tabNavigationIsolation';
import * as finalizeMod from './tabGroupFinalize';
import type { ChildTabNavigationPolicy } from './tabNavigationIsolation';

// =============================================================================
// Section 5: TabGroupManager
// =============================================================================

export class TabGroupManager {
  static instance: TabGroupManager;
  groupMetadata = new Map<number, GroupMetadata>();
  initialized = false;
  STORAGE_KEY = StorageKeys.TAB_GROUPS;
  groupBlocklistStatuses = new Map<number, GroupBlocklistStatus>();
  blocklistListeners = new Set<(groupId: number, category: string | undefined) => void>();
  pendingRegroups = new Map<number, PendingRegroup>();
  processingMainTabRemoval = new Set<number>();
  mcpTabGroupId: number | null = null;
  MCP_TAB_GROUP_KEY = StorageKeys.MCP_TAB_GROUP_ID;
  MCP_TAB_GROUP_OWNER_KEY = StorageKeys.MCP_TAB_GROUP_OWNER;
  tabGroupListenerSubscriptionId: string | null = null;
  isTabGroupListenerStarted = false;
  isTabCreationListenerStarted = false;
  protectedActiveTabsByWindow = new Map<number, { tabId: number; expiresAt: number }>();
  childTabNavigationPoliciesByOpener = new Map<number, ChildTabNavigationPolicy>();
  DISMISSED_GROUPS_KEY = StorageKeys.DISMISSED_TAB_GROUPS;

  constructor() {
    this.startTabRemovalListener();
    this.startTabCreationListener();
  }

  startTabRemovalListener(): void {
    blocklist.startTabRemovalListener(this);
  }

  static getInstance(): TabGroupManager {
    return (
      TabGroupManager.instance || (TabGroupManager.instance = new TabGroupManager()),
      TabGroupManager.instance
    );
  }

  // --- storage ---
  async initialize(force = false): Promise<void> {
    return storage.initialize(this, force);
  }

  async loadFromStorage(): Promise<void> {
    return storage.loadFromStorage(this);
  }

  async saveToStorage(): Promise<void> {
    return storage.saveToStorage(this);
  }

  async dismissStaticIndicatorsForGroup(chromeGroupId: number): Promise<void> {
    return storage.dismissStaticIndicatorsForGroup(this, chromeGroupId);
  }

  async isGroupDismissed(chromeGroupId: number): Promise<boolean> {
    return storage.isGroupDismissed(this, chromeGroupId);
  }

  // --- queries ---
  findMainTabInChromeGroup(chromeGroupId: number): number | null {
    return queries.findMainTabInChromeGroup(this, chromeGroupId);
  }

  async getGroupMembers(chromeGroupId: number): Promise<GroupMemberTab[]> {
    return queries.getGroupMembers(this, chromeGroupId);
  }

  async getGroupDetails(mainTabId: number): Promise<GroupWithMembers> {
    return queries.getGroupDetails(this, mainTabId);
  }

  async getAllGroups(): Promise<GroupWithMembers[]> {
    return queries.getAllGroups(this);
  }

  async findGroupByTab(tabId: number): Promise<GroupWithMembers | null> {
    return queries.findGroupByTab(this, tabId);
  }

  async findGroupByMainTab(mainTabId: number): Promise<GroupWithMembers | null> {
    return queries.findGroupByMainTab(this, mainTabId);
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
    return queries.findOrphanedTabs(this);
  }

  async isInGroup(tabId: number): Promise<boolean> {
    return queries.isInGroup(this, tabId);
  }

  isMainTab(tabId: number): boolean {
    return queries.isMainTab(this, tabId);
  }

  findMainTabIdSync(tabId: number): number | undefined {
    return queries.findMainTabIdSync(this, tabId);
  }

  getGroupMemberIds(mainTabId: number): number[] {
    return queries.getGroupMemberIds(this, mainTabId);
  }

  async getMainTabId(tabId: number): Promise<number | null> {
    return queries.getMainTabId(this, tabId);
  }

  async getGroup(mainTabId: number): Promise<GroupWithMembers | undefined> {
    return queries.getGroup(this, mainTabId);
  }

  // --- lifecycle ---
  async createGroup(tabId: number, options?: CreateGroupOptions): Promise<GroupWithMembers> {
    return lifecycle.createGroup(this, tabId, options);
  }

  async adoptOrphanedGroup(tabId: number, chromeGroupId: number): Promise<GroupWithMembers> {
    return lifecycle.adoptOrphanedGroup(this, tabId, chromeGroupId);
  }

  async addTabToGroup(
    mainTabId: number,
    tabId: number,
    options?: AddTabToGroupOptions
  ): Promise<void> {
    return lifecycle.addTabToGroup(this, mainTabId, tabId, options);
  }

  async deleteGroup(mainTabId: number): Promise<void> {
    return lifecycle.deleteGroup(this, mainTabId);
  }

  async clearAllGroups(): Promise<void> {
    return lifecycle.clearAllGroups(this);
  }

  async clearAll(): Promise<void> {
    return lifecycle.clearAll(this);
  }

  async cleanupOldGroup(oldGroupId: number, excludeTabId: number): Promise<void> {
    return lifecycle.cleanupOldGroup(this, oldGroupId, excludeTabId);
  }

  async handleTabClosed(tabId: number): Promise<void> {
    return lifecycle.handleTabClosed(this, tabId);
  }

  // --- regroup ---
  scheduleRegroupRetry(tabId: number): void {
    regroup.scheduleRegroupRetry(this, tabId);
  }

  async attemptRegroup(tabId: number): Promise<void> {
    return regroup.attemptRegroup(this, tabId);
  }

  // --- reconcile ---
  startTabGroupChangeListener(): void {
    reconcile.startTabGroupChangeListener(this);
  }

  stopTabGroupChangeListener(): void {
    reconcile.stopTabGroupChangeListener(this);
  }

  async handleTabGroupChange(tabId: number, newGroupId: number): Promise<void> {
    return reconcile.handleTabGroupChange(this, tabId, newGroupId);
  }

  async reconcileWithChrome(): Promise<void> {
    recordEvent({ domain: 'tab-state', event: 'tab.group.reconcile.start', ids: {} });
    try {
      const result = await reconcile.reconcileWithChrome(this);
      recordEvent({
        domain: 'tab-state',
        event: 'tab.group.reconcile.end',
        data: { success: true }
      });
      return result;
    } catch (err) {
      recordError('tab-state', 'tab.group.reconcile.end', err, {}, { success: false });
      throw err;
    }
  }

  // --- promotion ---
  async promoteToMainTab(oldMainTabId: number, newMainTabId: number): Promise<void> {
    return promotion.promoteToMainTab(this, oldMainTabId, newMainTabId);
  }

  // --- validation ---
  async isTabInSameGroup(tabId1: number, tabId2: number): Promise<boolean> {
    return validation.isTabInSameGroup(this, tabId1, tabId2);
  }

  async getValidTabIds(tabId: number): Promise<number[]> {
    return validation.getValidTabIds(this, tabId);
  }

  async getValidTabsWithMetadata(
    tabId: number
  ): Promise<{ id: number; title: string; url: string }[]> {
    return validation.getValidTabsWithMetadata(this, tabId);
  }

  async getEffectiveTabId(
    requestedTabId: number | undefined,
    currentTabId: number
  ): Promise<number> {
    return validation.getEffectiveTabId(this, requestedTabId, currentTabId);
  }

  // --- blocklist ---
  async updateTabBlocklistStatus(tabId: number, url: string): Promise<void> {
    return blocklist.updateTabBlocklistStatus(this, tabId, url);
  }

  async removeTabFromBlocklistTracking(groupId: number, tabId: number): Promise<void> {
    return blocklist.removeTabFromBlocklistTracking(this, groupId, tabId);
  }

  async updateGroupBlocklistStatus(
    groupId: number,
    tabId: number,
    category: string | undefined,
    isBlockedHtml = false
  ): Promise<void> {
    return blocklist.updateGroupBlocklistStatus(this, groupId, tabId, category, isBlockedHtml);
  }

  async recalculateGroupBlocklistStatus(groupId: number): Promise<void> {
    return blocklist.recalculateGroupBlocklistStatus(this, groupId);
  }

  getMostRestrictiveCategory(categories: (string | undefined)[]): string | undefined {
    return blocklist.getMostRestrictiveCategory(categories);
  }

  async getGroupBlocklistStatus(mainTabId: number): Promise<string | undefined> {
    return blocklist.getGroupBlocklistStatus(this, mainTabId);
  }

  async getBlockedTabsInfo(
    mainTabId: number
  ): Promise<{ isMainTabBlocked: boolean; blockedTabs: BlockedTabInfo[] }> {
    return blocklist.getBlockedTabsInfo(this, mainTabId);
  }

  async checkAllTabsInGroupForBlocklist(chromeGroupId: number): Promise<void> {
    return blocklist.checkAllTabsInGroupForBlocklist(this, chromeGroupId);
  }

  addBlocklistListener(listener: (groupId: number, category: string | undefined) => void): void {
    blocklist.addBlocklistListener(this, listener);
  }

  removeBlocklistListener(listener: (groupId: number, category: string | undefined) => void): void {
    blocklist.removeBlocklistListener(this, listener);
  }

  notifyBlocklistListeners(groupId: number, category: string | undefined): void {
    blocklist.notifyBlocklistListeners(this, groupId, category);
  }

  clearBlocklistCache(): void {
    blocklist.clearBlocklistCache(this);
  }

  // --- indicators ---
  async setTabIndicatorState(
    tabId: number,
    state: string,
    isMcp?: boolean,
    queueUpdate = true
  ): Promise<void> {
    return indicators.setTabIndicatorState(this, tabId, state, isMcp, queueUpdate);
  }

  async setGroupIndicatorState(mainTabId: number, state: string): Promise<void> {
    return indicators.setGroupIndicatorState(this, mainTabId, state);
  }

  getTabIndicatorState(tabId: number): string {
    return indicators.getTabIndicatorState(this, tabId);
  }

  async showSecondaryTabIndicators(mainTabId: number): Promise<void> {
    return indicators.showSecondaryTabIndicators(this, mainTabId);
  }

  async showStaticIndicatorsForChromeGroup(chromeGroupId: number): Promise<void> {
    return indicators.showStaticIndicatorsForChromeGroup(this, chromeGroupId);
  }

  async hideSecondaryTabIndicators(mainTabId: number): Promise<void> {
    return indicators.hideSecondaryTabIndicators(this, mainTabId);
  }

  async hideIndicatorForToolUse(tabId: number): Promise<void> {
    return indicators.hideIndicatorForToolUse(this, tabId);
  }

  async restoreIndicatorAfterToolUse(tabId: number): Promise<void> {
    return indicators.restoreIndicatorAfterToolUse(this, tabId);
  }

  async startRunning(mainTabId: number): Promise<void> {
    return indicators.startRunning(this, mainTabId);
  }

  async showRunningIndicatorImmediately(tabId: number, isMcp = true): Promise<void> {
    return indicators.showRunningIndicatorImmediately(this, tabId, isMcp);
  }

  async stopRunning(): Promise<void> {
    return indicators.stopRunning(this);
  }

  async clearIndicatorsForGroup(mainTabId: number): Promise<void> {
    return indicators.clearIndicatorsForGroup(this, mainTabId);
  }

  queueIndicatorUpdate(tabId: number, state: string): void {
    indicators.queueIndicatorUpdate(this, tabId, state);
  }

  async processIndicatorQueue(): Promise<void> {
    return indicators.processIndicatorQueue(this);
  }

  async sendIndicatorMessage(
    tabId: number,
    messageType: string,
    isMcp?: boolean
  ): Promise<boolean> {
    return indicators.sendIndicatorMessage(this, tabId, messageType, isMcp);
  }

  // --- prefix ---
  async updateGroupTitle(mainTabId: number, title: string, isLoading = false): Promise<void> {
    return prefixMod.updateGroupTitle(this, mainTabId, title, isLoading);
  }

  async updateTabGroupPrefix(
    mainTabId: number,
    prefix: string | null,
    removePrefix?: string
  ): Promise<void> {
    return prefixMod.updateTabGroupPrefix(this, mainTabId, prefix, removePrefix);
  }

  async addCompletionPrefix(mainTabId: number): Promise<void> {
    return prefixMod.addCompletionPrefix(this, mainTabId);
  }

  async addLoadingPrefix(mainTabId: number): Promise<void> {
    return prefixMod.addLoadingPrefix(this, mainTabId);
  }

  async addPermissionPrefix(mainTabId: number): Promise<void> {
    return prefixMod.addPermissionPrefix(this, mainTabId);
  }

  async removeCompletionPrefix(mainTabId: number): Promise<void> {
    return prefixMod.removeCompletionPrefix(this, mainTabId);
  }

  async setGroupColor(mainTabId: number, color: chrome.tabGroups.Color): Promise<void> {
    return prefixMod.setGroupColor(this, mainTabId, color);
  }

  async removePrefix(mainTabId: number): Promise<void> {
    return prefixMod.removePrefix(this, mainTabId);
  }

  // --- mcp ---
  async addTabToIndicatorGroup(options: {
    tabId: number;
    isRunning: boolean;
    isMcp?: boolean;
  }): Promise<void> {
    return mcp.addTabToIndicatorGroup(this, options);
  }

  async getTabForMcp(
    tabId?: number,
    tabGroupId?: number
  ): Promise<{ tabId: number | undefined; domain?: string; url?: string }> {
    return mcp.getTabForMcp(this, tabId, tabGroupId);
  }

  async isTabMcp(tabId: number): Promise<boolean> {
    return mcp.isTabMcp(this, tabId);
  }

  async ensureMcpGroupCharacteristics(chromeGroupId: number): Promise<void> {
    return mcp.ensureMcpGroupCharacteristics(this, chromeGroupId);
  }

  async clearMcpTabGroup(): Promise<void> {
    return mcp.clearMcpTabGroup(this);
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
    return mcp.getOrCreateMcpTabContext(this, options);
  }

  async saveMcpTabGroupId(): Promise<void> {
    return mcp.saveMcpTabGroupId(this);
  }

  async loadMcpTabGroupId(): Promise<void> {
    return mcp.loadMcpTabGroupId(this);
  }

  async findMcpTabGroupByCharacteristics(): Promise<number | null> {
    return mcp.findMcpTabGroupByCharacteristics(this);
  }

  // --- navigation isolation ---
  startTabCreationListener(): void {
    navIsolation.startTabCreationListener(this);
  }

  async withPreservedActiveTab<T>(tabId: number, action: () => Promise<T>): Promise<T> {
    return navIsolation.withPreservedActiveTab(this, tabId, action);
  }

  async handleTabCreated(tab: chrome.tabs.Tab): Promise<void> {
    return navIsolation.handleTabCreated(this, tab);
  }

  rememberChildTabNavigationPolicy(
    openerTabId: number,
    policy: Omit<ChildTabNavigationPolicy, 'expiresAt' | 'timeoutId'>,
    ttlMs?: number
  ): void {
    return navIsolation.rememberChildTabNavigationPolicy(this, openerTabId, policy, ttlMs);
  }

  async adoptChildTabsFromOpener(openerTabId: number): Promise<number[]> {
    return navIsolation.adoptChildTabsFromOpener(this, openerTabId);
  }

  async createChildTabInGroup(openerTabId: number, url: string): Promise<number | undefined> {
    return navIsolation.createChildTabInGroup(this, openerTabId, url);
  }

  // --- mcp group extras ---
  async createMcpTabGroup(options?: { active?: boolean }): Promise<{
    currentTabId: number;
    availableTabs: { id: number; title: string; url: string }[];
    tabCount: number;
    tabGroupId: number;
  }> {
    return mcp.createMcpTabGroup(this, options);
  }

  async loadStoredMcpTabGroupId(): Promise<void> {
    return mcp.loadStoredMcpTabGroupId(this);
  }

  async isCurrentMcpChromeGroup(chromeGroupId: number): Promise<boolean> {
    return mcp.isCurrentMcpChromeGroup(this, chromeGroupId);
  }

  async updateMcpTabGroupIdAfterRegroup(
    oldChromeGroupId: number,
    newChromeGroupId: number
  ): Promise<void> {
    return mcp.updateMcpTabGroupIdAfterRegroup(this, oldChromeGroupId, newChromeGroupId);
  }

  // --- finalize ---
  async finalizeManagedGroup(
    options?: FinalizeManagedGroupOptions
  ): Promise<FinalizedTabContext | undefined> {
    return finalizeMod.finalizeManagedGroup(this, options);
  }

  async finalizeMcpTabGroup(options?: {
    keep?: FinalizeTabsKeep[];
  }): Promise<FinalizedTabContext | undefined> {
    return finalizeMod.finalizeMcpTabGroup(this, options);
  }
}

export const tabGroupManager = TabGroupManager.getInstance();
