import { StorageKeys } from '../../extensionServices';
import { getStorageArea, isRecord } from './chromeStorage';

export type TabLeaseOrigin = 'agent' | 'user';
export type TabLeaseState = 'active' | 'handoff';

export interface TabLease {
  tabId: number;
  sessionId: string;
  origin: TabLeaseOrigin;
  claimedAt: number;
  state: TabLeaseState;
  groupId?: number;
  /**
   * Marks the tab that was the agent's primary focus when it handed the
   * session off. On resume, buildSessionContextFromLeases promotes this tab
   * to currentTabId so the next turn continues on the right tab instead of
   * whichever happens to sort first by window/index.
   */
  isActiveHandoff?: boolean;
}

export class BrowserSessionConflictError extends Error {
  readonly code = 'browser_session_conflict';

  constructor(
    readonly tabId: number,
    readonly owningSessionId: string
  ) {
    super(`Tab ${tabId} is already part of browser session ${owningSessionId}`);
    this.name = 'BrowserSessionConflictError';
  }
}

function isLeaseOrigin(value: unknown): value is TabLeaseOrigin {
  return value === 'agent' || value === 'user';
}

function isLeaseState(value: unknown): value is TabLeaseState {
  return value === 'active' || value === 'handoff';
}

function parseLease(tabIdKey: string, value: unknown): TabLease | undefined {
  if (!isRecord(value)) return undefined;
  const tabId = value.tabId;
  const sessionId = value.sessionId;
  const origin = value.origin;
  const claimedAt = value.claimedAt;
  const state = value.state;
  const keyTabId = Number(tabIdKey);
  if (!Number.isInteger(keyTabId)) return undefined;
  if (tabId !== keyTabId) return undefined;
  if (typeof tabId !== 'number' || !Number.isInteger(tabId)) return undefined;
  if (typeof sessionId !== 'string' || !sessionId) return undefined;
  if (!isLeaseOrigin(origin)) return undefined;
  if (typeof claimedAt !== 'number' || !Number.isFinite(claimedAt)) return undefined;
  if (!isLeaseState(state)) return undefined;

  const lease: TabLease = {
    tabId,
    sessionId,
    origin,
    claimedAt,
    state
  };
  if (typeof value.groupId === 'number' && Number.isInteger(value.groupId)) {
    lease.groupId = value.groupId;
  }
  if (typeof value.isActiveHandoff === 'boolean') {
    lease.isActiveHandoff = value.isActiveHandoff;
  }
  return lease;
}

function cloneLease(lease: TabLease): TabLease {
  return { ...lease };
}

class TabLeaseManager {
  static instance: TabLeaseManager;
  readonly storageKey: string = StorageKeys.TAB_LEASES;
  leases = new Map<number, TabLease>();
  initialized = false;
  private mutationQueue: Promise<void> = Promise.resolve();
  private listenersStarted = false;
  private leaseChangeListeners = new Set<(changedTabIds: number[], sessionId: string) => void>();

  constructor() {
    this.startTabLifecycleListeners();
  }

  static getInstance(): TabLeaseManager {
    return (
      TabLeaseManager.instance || (TabLeaseManager.instance = new TabLeaseManager()),
      TabLeaseManager.instance
    );
  }

  /**
   * Subscribe to lease mutations. The listener is invoked synchronously after
   * a mutation has been persisted, with the affected tabIds and the sessionId.
   * An empty sessionId means the change was tab-lifecycle driven (e.g. a tab
   * closed) and the listener must look up ownership itself. Exceptions thrown
   * by a listener are swallowed so a faulty observer can't break the queue.
   */
  addLeaseChangeListener(
    listener: (changedTabIds: number[], sessionId: string) => void
  ): () => void {
    this.leaseChangeListeners.add(listener);
    return () => this.leaseChangeListeners.delete(listener);
  }

  private notifyLeaseChangeListeners(changedTabIds: number[], sessionId: string): void {
    if (this.leaseChangeListeners.size === 0 || changedTabIds.length === 0) return;
    for (const listener of this.leaseChangeListeners) {
      try {
        listener(changedTabIds, sessionId);
      } catch {
        // ignore observer errors
      }
    }
  }

  private startTabLifecycleListeners(): void {
    if (this.listenersStarted) return;
    chrome.tabs.onRemoved?.addListener?.((tabId: number) => {
      void this.removeTab(tabId);
    });
    chrome.tabs.onReplaced?.addListener?.((addedTabId: number, removedTabId: number) => {
      void this.replaceTab(removedTabId, addedTabId);
    });
    this.listenersStarted = true;
  }

  private async withMutation<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.mutationQueue;
    let release!: () => void;
    this.mutationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous.catch(() => {});
    try {
      await this.initialize();
      return await action();
    } finally {
      release();
    }
  }

  private async withRead<T>(action: () => T | Promise<T>): Promise<T> {
    const previous = this.mutationQueue;
    let release!: () => void;
    const readFinished = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.mutationQueue = previous.then(() => readFinished);
    await previous.catch(() => {});
    try {
      await this.initialize();
      return await action();
    } finally {
      release();
    }
  }

  async initialize(force = false): Promise<void> {
    if (this.initialized && !force) return;
    await this.loadFromStorage();
    this.initialized = true;
  }

  async loadFromStorage(): Promise<void> {
    const storage = getStorageArea();
    const stored = await storage.get(this.storageKey);
    const payload = stored[this.storageKey];
    const next = new Map<number, TabLease>();
    if (isRecord(payload) && isRecord(payload.leases)) {
      for (const [tabIdKey, value] of Object.entries(payload.leases)) {
        const lease = parseLease(tabIdKey, value);
        if (lease) next.set(lease.tabId, lease);
      }
    }
    this.leases = next;
  }

  async saveToStorage(): Promise<void> {
    const storage = getStorageArea();
    const leases = Object.fromEntries(
      Array.from(this.leases.entries()).map(([tabId, lease]) => [String(tabId), lease])
    );
    await storage.set({ [this.storageKey]: { leases } });
  }

  async claimTab(
    sessionId: string,
    tabId: number,
    origin: TabLeaseOrigin,
    extras: { groupId?: number } = {}
  ): Promise<TabLease> {
    return await this.withMutation(async () => {
      const existing = this.leases.get(tabId);
      if (existing) {
        if (existing.sessionId !== sessionId) {
          throw new BrowserSessionConflictError(tabId, existing.sessionId);
        }
        const updated: TabLease = {
          ...existing,
          state: 'active',
          // Re-claiming starts a fresh interaction context; any prior
          // handoff "primary tab" marker is no longer meaningful.
          isActiveHandoff: false
        };
        if (typeof extras.groupId === 'number') updated.groupId = extras.groupId;
        this.leases.set(tabId, updated);
        await this.saveToStorage();
        this.notifyLeaseChangeListeners([tabId], sessionId);
        return cloneLease(updated);
      }

      const lease: TabLease = {
        tabId,
        sessionId,
        origin,
        claimedAt: Date.now(),
        state: 'active'
      };
      if (typeof extras.groupId === 'number') lease.groupId = extras.groupId;
      this.leases.set(tabId, lease);
      await this.saveToStorage();
      this.notifyLeaseChangeListeners([tabId], sessionId);
      return cloneLease(lease);
    });
  }

  async assertTabAvailableForSession(sessionId: string, tabId: number): Promise<void> {
    await this.withRead(() => {
      const lease = this.leases.get(tabId);
      if (lease && lease.sessionId !== sessionId) {
        throw new BrowserSessionConflictError(tabId, lease.sessionId);
      }
    });
  }

  async getLease(tabId: number): Promise<TabLease | undefined> {
    return await this.withRead(() => {
      const lease = this.leases.get(tabId);
      return lease ? cloneLease(lease) : undefined;
    });
  }

  async getSessionActiveLeases(sessionId: string): Promise<TabLease[]> {
    return await this.withRead(() =>
      Array.from(this.leases.values())
        .filter((lease) => lease.sessionId === sessionId && lease.state === 'active')
        .map(cloneLease)
    );
  }

  async getActiveLeasedTabIds(): Promise<number[]> {
    return await this.withRead(() =>
      Array.from(this.leases.values())
        .filter((lease) => lease.state === 'active')
        .map((lease) => lease.tabId)
    );
  }

  async handoffTabs(
    sessionId: string,
    tabIds: number[],
    options: { groupId?: number; activeTabId?: number } = {}
  ): Promise<void> {
    await this.withMutation(async () => {
      let changed = false;
      const changedTabIds: number[] = [];
      const handoffTabIds = new Set(tabIds);
      for (const [tabId, lease] of this.leases.entries()) {
        if (lease.sessionId !== sessionId) continue;
        if (!handoffTabIds.has(tabId)) {
          if (lease.isActiveHandoff === true) {
            this.leases.set(tabId, { ...lease, isActiveHandoff: false });
            changedTabIds.push(tabId);
            changed = true;
          }
          continue;
        }
        const updated: TabLease = {
          ...lease,
          state: 'handoff',
          // Exactly one handoff tab may be marked as the primary continuation
          // point; the rest are explicitly cleared so a stale marker from a
          // previous handoff never survives.
          isActiveHandoff: tabId === options.activeTabId
        };
        if (typeof options.groupId === 'number') updated.groupId = options.groupId;
        this.leases.set(tabId, updated);
        changedTabIds.push(tabId);
        changed = true;
      }
      if (changed) {
        await this.saveToStorage();
        this.notifyLeaseChangeListeners(changedTabIds, sessionId);
      }
    });
  }

  async resumeHandoffTabs(sessionId: string, tabIds?: number[]): Promise<TabLease[]> {
    return await this.withMutation(async () => {
      const allowed = tabIds ? new Set(tabIds) : undefined;
      const resumed: TabLease[] = [];
      const changedTabIds: number[] = [];
      for (const [tabId, lease] of this.leases.entries()) {
        if (lease.sessionId !== sessionId || lease.state !== 'handoff') continue;
        if (allowed && !allowed.has(tabId)) continue;
        const updated: TabLease = {
          ...lease,
          state: 'active'
          // isActiveHandoff is intentionally preserved: buildSessionContextFromLeases
          // reads it to pick currentTabId after resume. The next handoffTabs
          // call refreshes it.
        };
        this.leases.set(tabId, updated);
        resumed.push(cloneLease(updated));
        changedTabIds.push(tabId);
      }
      if (resumed.length > 0) {
        await this.saveToStorage();
        this.notifyLeaseChangeListeners(changedTabIds, sessionId);
      }
      // Promote the primary handoff tab to the front so callers can treat
      // resumed[0] as the continuation point.
      resumed.sort((a, b) => {
        const av = a.isActiveHandoff === true ? 0 : 1;
        const bv = b.isActiveHandoff === true ? 0 : 1;
        return av - bv;
      });
      return resumed;
    });
  }

  async releaseTabs(sessionId: string, tabIds: number[]): Promise<void> {
    await this.withMutation(async () => {
      await this.releaseLeasesLocked(sessionId, tabIds);
    });
  }

  async releaseSession(sessionId: string): Promise<void> {
    await this.withMutation(async () => {
      const tabIds = Array.from(this.leases.entries())
        .filter(([, lease]) => lease.sessionId === sessionId)
        .map(([tabId]) => tabId);
      await this.releaseLeasesLocked(sessionId, tabIds);
    });
  }

  private async releaseLeasesLocked(sessionId: string, tabIds: number[]): Promise<void> {
    let changed = false;
    const changedTabIds: number[] = [];
    for (const tabId of tabIds) {
      const lease = this.leases.get(tabId);
      if (!lease || lease.sessionId !== sessionId) continue;
      this.leases.delete(tabId);
      changedTabIds.push(tabId);
      changed = true;
    }
    if (changed) {
      await this.saveToStorage();
      this.notifyLeaseChangeListeners(changedTabIds, sessionId);
    }
  }

  async removeTab(tabId: number): Promise<void> {
    await this.withMutation(async () => {
      const lease = this.leases.get(tabId);
      if (!this.leases.delete(tabId)) return;
      await this.saveToStorage();
      this.notifyLeaseChangeListeners([tabId], lease?.sessionId ?? '');
    });
  }

  async replaceTab(oldTabId: number, newTabId: number): Promise<void> {
    await this.withMutation(async () => {
      const lease = this.leases.get(oldTabId);
      if (!lease) return;
      this.leases.delete(oldTabId);
      this.leases.set(newTabId, { ...lease, tabId: newTabId });
      await this.saveToStorage();
      this.notifyLeaseChangeListeners([oldTabId, newTabId], lease.sessionId);
    });
  }

  async pruneMissingTabs(): Promise<void> {
    await this.withMutation(async () => {
      const tabIds = Array.from(this.leases.keys());
      if (tabIds.length === 0) return;
      let missingTabIds: number[];
      try {
        const allTabs = await chrome.tabs.query({});
        const validTabIds = new Set(
          allTabs.map((tab) => tab.id).filter((id): id is number => typeof id === 'number')
        );
        missingTabIds = tabIds.filter((tabId) => !validTabIds.has(tabId));
      } catch {
        const results = await Promise.allSettled(tabIds.map((tabId) => chrome.tabs.get(tabId)));
        missingTabIds = tabIds.filter((_, index) => results[index].status === 'rejected');
      }
      for (const tabId of missingTabIds) {
        this.leases.delete(tabId);
      }
      if (missingTabIds.length > 0) {
        await this.saveToStorage();
        this.notifyLeaseChangeListeners(missingTabIds, '');
      }
    });
  }
}

export const tabLeaseManager = TabLeaseManager.getInstance();
