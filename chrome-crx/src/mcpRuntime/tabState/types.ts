export const TAB_GROUP_MARKER = '🦆';
export const TAB_GROUP_TITLE = '🦆SuperDuck';
export const DEFAULT_SESSION_KEY = '__default__';

export type TabMemberOrigin = 'agent' | 'user';
export type TabMemberDisposition = 'active' | 'handoff';

export interface MemberState {
  indicatorState: string;
  previousIndicatorState?: string;
  isMcp?: boolean;
  pendingUpdate?: string;
  origin?: TabMemberOrigin;
  disposition?: TabMemberDisposition;
}

export interface GroupMetadata {
  mainTabId: number;
  createdAt: number;
  domain: string;
  chromeGroupId: number;
  memberStates: Map<number, MemberState>;
  isUnmanaged?: boolean;
  hasLegacyMemberOrigins?: boolean;
}

export interface GroupWithMembers extends GroupMetadata {
  memberTabs: GroupMemberTab[];
}

export interface GroupMemberTab {
  tabId: number;
  url: string;
  title: string;
  joinedAt: number;
  indicatorState?: string;
}

export interface GroupBlocklistStatus {
  groupId: number;
  mostRestrictiveCategory: string | undefined;
  categoriesByTab: Map<number, string | undefined>;
  blockedHtmlTabs: Set<number>;
  lastChecked: number;
}

export interface StoredGroupMetadata extends Omit<GroupMetadata, 'memberStates'> {
  memberStates?: Record<string, MemberState>;
}

export interface PendingRegroup {
  tabId: number;
  originalGroupId: number;
  indicatorState: string;
  origin: TabMemberOrigin;
  disposition: TabMemberDisposition;
  metadata: GroupMetadata;
  attemptCount: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}

export interface BlockedTabInfo {
  tabId: number;
  title: string;
  url: string;
  category: string;
}

export type FinalizeTabStatus = 'handoff' | 'deliverable';

export interface CreateGroupOptions {
  origin?: TabMemberOrigin;
}

export interface AddTabToGroupOptions {
  origin?: TabMemberOrigin;
  sessionId?: string;
}

export interface FinalizeTabsKeep {
  tabId: number;
  status: FinalizeTabStatus;
}

export interface FinalizeManagedGroupOptions {
  mainTabId?: number;
  chromeGroupId?: number;
  keep?: FinalizeTabsKeep[];
}

export interface FinalizeMcpTabGroupOptions {
  keep?: FinalizeTabsKeep[];
  sessionId?: string;
}

export interface FinalizedTabContext {
  currentTabId: number;
  availableTabs: { id: number; title: string; url: string }[];
  tabCount: number;
  tabGroupId: number;
}
