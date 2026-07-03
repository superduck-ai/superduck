import { StorageKeys } from '../../extensionServices';
import { tabLeaseManager } from './tabLeases';
import { getTabEventManager } from './tabEvents';
import { getStorageArea, isRecord } from './chromeStorage';

// Per-tab badges rendered on the extension action icon. They are a
// content-script-independent fallback for the agent-visual-indicator overlay:
// when the overlay can't inject (page not ready, cross-origin iframe,
// restricted pages), the badge still surfaces lease state to the user.
//
// MV3 constraint: chrome.action per-tab badges are only visible while their
// tab is active. So the `active` badge confirms "the agent is using this tab"
// once the user switches to it, and the `deliverable` badge confirms "this tab
// was handed to you" — clearing it on activation doubles as the read receipt.

const ACTIVE_BADGE_TEXT = '●';
const DELIVERABLE_BADGE_TEXT = '✓';
const ACTIVE_BADGE_COLOR = '#F26B1F'; // SuperDuck orange, matches tab group color
const DELIVERABLE_BADGE_COLOR = '#2E8B57'; // green

class TabBadgeManager {
  static instance: TabBadgeManager | null = null;

  readonly storageKey: string = StorageKeys.TAB_DELIVERABLE_BADGES;
  private deliverableTabIds = new Set<number>();
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private mutationQueue: Promise<void> = Promise.resolve();
  private leaseUnsubscribe: (() => void) | null = null;
  private tabEventSubscriptionId: string | null = null;
  /** Guards against reentrant badge writes for the same tab within one tick. */
  private pendingRefresh = new Set<number>();
  private refreshScheduled = false;

  static getInstance(): TabBadgeManager {
    return (
      TabBadgeManager.instance || (TabBadgeManager.instance = new TabBadgeManager()),
      TabBadgeManager.instance
    );
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return await this.initPromise;
    this.initPromise = (async () => {
      let replayTabIds: number[] = [];
      await this.withMutation(async () => {
        if (this.initialized) return;
        await this.loadDeliverableFromStorage();
        // Drop deliverable markers for tabs that were closed while the worker was
        // down (the onRemoved listener can't fire for a dead worker). Do this
        // before replaying badges so we don't rehydrate stale ids.
        await this.pruneMissingTabsLocked();
        replayTabIds = Array.from(this.deliverableTabIds);
        this.registerLeaseListener();
        this.registerTabActivationListener();
        this.registerTabRemovedListener();
        this.initialized = true;
      });
      // Replay deliverable badges after a SW restart (chrome.action badge state
      // is cleared when the worker dies).
      await Promise.all(replayTabIds.map((tabId) => this.applyBadge(tabId)));
    })();
    try {
      await this.initPromise;
    } catch (err) {
      this.initPromise = null;
      throw err;
    }
  }

  private async loadDeliverableFromStorage(): Promise<void> {
    const stored = await getStorageArea().get(this.storageKey);
    const payload = stored[this.storageKey];
    this.deliverableTabIds = new Set();
    if (isRecord(payload) && Array.isArray(payload.tabIds)) {
      for (const tabId of payload.tabIds) {
        if (typeof tabId === 'number' && Number.isInteger(tabId)) {
          this.deliverableTabIds.add(tabId);
        }
      }
    }
  }

  private async persistDeliverable(): Promise<void> {
    try {
      await getStorageArea().set({
        [this.storageKey]: { tabIds: Array.from(this.deliverableTabIds) }
      });
    } catch (err) {
      console.warn('[tabBadges] failed to persist deliverable badges', err);
    }
  }

  private async withMutation<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.mutationQueue;
    let release!: () => void;
    this.mutationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous.catch(() => {});
    try {
      return await action();
    } finally {
      release();
    }
  }

  /**
   * Mark tabs as agent deliverables (finalized out of the managed group for
   * the user). Shows a ✓ badge that clears when the user switches to the tab.
   */
  async markDeliverable(tabIds: number[]): Promise<void> {
    if (tabIds.length === 0) return;
    const validTabIds = tabIds.filter(
      (tabId) => typeof tabId === 'number' && Number.isInteger(tabId)
    );
    if (validTabIds.length === 0) return;
    await this.withMutation(async () => {
      for (const tabId of validTabIds) this.deliverableTabIds.add(tabId);
      await this.persistDeliverable();
    });
    await Promise.all(validTabIds.map((tabId) => this.applyBadge(tabId)));
  }

  private registerLeaseListener(): void {
    if (this.leaseUnsubscribe) return;
    this.leaseUnsubscribe = tabLeaseManager.addLeaseChangeListener((changedTabIds) => {
      for (const tabId of changedTabIds) this.scheduleRefresh(tabId);
    });
  }

  private registerTabActivationListener(): void {
    if (this.tabEventSubscriptionId) return;
    const eventManager = getTabEventManager();
    this.tabEventSubscriptionId = eventManager.subscribe('all', ['active'], (tabId) => {
      // Read receipt: switching to a deliverable tab clears its badge.
      if (this.deliverableTabIds.has(tabId)) {
        void this.clearDeliverable(tabId);
      }
    });
  }

  private tabRemovedListener: ((tabId: number) => void) | null = null;
  private registerTabRemovedListener(): void {
    if (this.tabRemovedListener) return;
    const listener = (tabId: number) => {
      // A deliverable tab the user closed must not linger in storage — otherwise
      // a recycled tab id inherits a ✓ badge it never earned, and the set grows
      // unbounded across a long browser session.
      if (this.deliverableTabIds.has(tabId)) {
        void this.clearDeliverable(tabId, { refreshBadge: false });
      }
    };
    this.tabRemovedListener = listener;
    chrome.tabs.onRemoved?.addListener?.(listener);
  }

  private scheduleRefresh(tabId: number): void {
    this.pendingRefresh.add(tabId);
    if (this.refreshScheduled) return;
    this.refreshScheduled = true;
    // Defer so a burst of lease mutations coalesces into one badge write per tab.
    queueMicrotask(() => {
      this.refreshScheduled = false;
      const ids = Array.from(this.pendingRefresh);
      this.pendingRefresh.clear();
      for (const id of ids) void this.applyBadge(id);
    });
  }

  private async applyBadge(tabId: number): Promise<void> {
    if (!chrome.action?.setBadgeText) return;
    try {
      if (this.deliverableTabIds.has(tabId)) {
        await chrome.action.setBadgeText({ tabId, text: DELIVERABLE_BADGE_TEXT });
        await chrome.action.setBadgeBackgroundColor({
          tabId,
          color: DELIVERABLE_BADGE_COLOR
        });
        return;
      }
      const lease = await tabLeaseManager.getLease(tabId);
      if (lease && lease.state === 'active') {
        await chrome.action.setBadgeText({ tabId, text: ACTIVE_BADGE_TEXT });
        await chrome.action.setBadgeBackgroundColor({ tabId, color: ACTIVE_BADGE_COLOR });
        return;
      }
      // No deliverable marker and no active lease (handoff or released) → clear.
      await chrome.action.setBadgeText({ tabId, text: '' });
    } catch {
      // Tab may already be closed; per-tab badge writes throw in that case.
    }
  }

  private async refreshDeliverableBadges(): Promise<void> {
    await Promise.all(Array.from(this.deliverableTabIds).map((tabId) => this.applyBadge(tabId)));
  }

  private async clearDeliverable(
    tabId: number,
    options: { refreshBadge?: boolean } = {}
  ): Promise<void> {
    let changed = false;
    await this.withMutation(async () => {
      changed = this.deliverableTabIds.delete(tabId);
      if (changed) await this.persistDeliverable();
    });
    if (changed && options.refreshBadge !== false) {
      await this.applyBadge(tabId);
    }
  }

  /**
   * Drop deliverable markers for tabs that no longer exist. Currently invoked
   * only from initialize(); safe to call repeatedly if wired into cleanup later.
   */
  async pruneMissingTabs(): Promise<void> {
    await this.withMutation(async () => {
      await this.pruneMissingTabsLocked();
    });
  }

  private async pruneMissingTabsLocked(): Promise<void> {
    if (this.deliverableTabIds.size === 0) return;
    const tabIds = Array.from(this.deliverableTabIds);
    const allTabs = await chrome.tabs.query({});
    const validTabIds = new Set(
      allTabs.map((tab) => tab.id).filter((id): id is number => typeof id === 'number')
    );
    let changed = false;
    for (const tabId of tabIds) {
      if (!validTabIds.has(tabId)) {
        this.deliverableTabIds.delete(tabId);
        changed = true;
      }
    }
    if (changed) await this.persistDeliverable();
  }
}

export const tabBadgeManager = TabBadgeManager.getInstance();
