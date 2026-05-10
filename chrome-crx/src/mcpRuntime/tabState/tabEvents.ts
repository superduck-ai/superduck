interface TabEventSubscription {
  tabId: number | 'all';
  eventTypes: string[];
  callback: (tabId: number, changeInfo: any, tab?: any) => void;
}

class TabEventManager {
  static instance: TabEventManager | null = null;
  subscriptions = new Map<string, TabEventSubscription>();
  chromeUpdateListener: ((tabId: number, changeInfo: any, tab: any) => void) | null = null;
  chromeActivatedListener: ((activeInfo: { tabId: number }) => void) | null = null;
  chromeRemovedListener: ((tabId: number) => void) | null = null;
  relevantTabIds = new Set<number>();
  nextSubscriptionId = 1;

  constructor() {}

  static getInstance(): TabEventManager {
    return (
      TabEventManager.instance || (TabEventManager.instance = new TabEventManager()),
      TabEventManager.instance
    );
  }

  subscribe(
    tabId: number | 'all',
    eventTypes: string[],
    callback: (tabId: number, changeInfo: any, tab?: any) => void
  ): string {
    const id = 'sub_' + this.nextSubscriptionId++;
    return (
      this.subscriptions.set(id, { tabId, eventTypes, callback }),
      'all' !== tabId && this.relevantTabIds.add(tabId),
      1 === this.subscriptions.size && this.startListeners(),
      id
    );
  }

  unsubscribe(subscriptionId: string): void {
    const sub = this.subscriptions.get(subscriptionId);
    if (sub) {
      if ((this.subscriptions.delete(subscriptionId), 'all' !== sub.tabId)) {
        let stillReferenced = false;
        for (const [, other] of this.subscriptions)
          if (other.tabId === sub.tabId) {
            stillReferenced = true;
            break;
          }
        stillReferenced || this.relevantTabIds.delete(sub.tabId);
      }
      0 === this.subscriptions.size && this.stopListeners();
    }
  }

  startListeners(): void {
    this.chromeUpdateListener = (tabId: number, changeInfo: any, tab: any) => {
      if (this.relevantTabIds.size > 0 && !this.relevantTabIds.has(tabId)) {
        let hasAllSub = false;
        for (const [, sub] of this.subscriptions)
          if ('all' === sub.tabId) {
            hasAllSub = true;
            break;
          }
        if (!hasAllSub) return;
      }
      const changes: any = {};
      let hasChanges = false;
      if (
        (void 0 !== changeInfo.url && ((changes.url = changeInfo.url), (hasChanges = true)),
        void 0 !== changeInfo.status && ((changes.status = changeInfo.status), (hasChanges = true)),
        'groupId' in changeInfo && ((changes.groupId = changeInfo.groupId), (hasChanges = true)),
        void 0 !== changeInfo.title && ((changes.title = changeInfo.title), (hasChanges = true)),
        hasChanges)
      )
        for (const [, sub] of this.subscriptions) {
          if ('all' !== sub.tabId && sub.tabId !== tabId) continue;
          let matchesEvent = false;
          for (const eventType of sub.eventTypes)
            if (void 0 !== changes[eventType]) {
              matchesEvent = true;
              break;
            }
          if (matchesEvent)
            try {
              sub.callback(tabId, changes, tab);
            } catch (err) {
              // ignore
            }
        }
    };
    this.chromeActivatedListener = (activeInfo: { tabId: number }) => {
      const activatedTabId = activeInfo.tabId;
      if (this.relevantTabIds.size > 0 && !this.relevantTabIds.has(activatedTabId)) {
        let hasAllSub = false;
        for (const [, sub] of this.subscriptions)
          if ('all' === sub.tabId) {
            hasAllSub = true;
            break;
          }
        if (!hasAllSub) return;
      }
      const changes = { active: true };
      for (const [, sub] of this.subscriptions)
        if (
          ('all' === sub.tabId || sub.tabId === activatedTabId) &&
          sub.eventTypes.includes('active')
        )
          try {
            sub.callback(activatedTabId, changes);
          } catch (err) {
            // ignore
          }
    };
    chrome.tabs.onUpdated.addListener(this.chromeUpdateListener);
    chrome.tabs.onActivated.addListener(this.chromeActivatedListener);
    this.chromeRemovedListener = (tabId: number) => {
      if (this.relevantTabIds.size > 0 && !this.relevantTabIds.has(tabId)) {
        let hasAllSub = false;
        for (const [, sub] of this.subscriptions)
          if ('all' === sub.tabId) {
            hasAllSub = true;
            break;
          }
        if (!hasAllSub) return;
      }
      const changes = { removed: true };
      for (const [, sub] of this.subscriptions)
        if (('all' === sub.tabId || sub.tabId === tabId) && sub.eventTypes.includes('removed'))
          try {
            sub.callback(tabId, changes);
          } catch (err) {
            // ignore
          }
    };
    chrome.tabs.onRemoved.addListener(this.chromeRemovedListener);
  }

  stopListeners(): void {
    this.chromeUpdateListener &&
      (chrome.tabs.onUpdated.removeListener(this.chromeUpdateListener),
      (this.chromeUpdateListener = null));
    this.chromeActivatedListener &&
      (chrome.tabs.onActivated.removeListener(this.chromeActivatedListener),
      (this.chromeActivatedListener = null));
    this.chromeRemovedListener &&
      (chrome.tabs.onRemoved.removeListener(this.chromeRemovedListener),
      (this.chromeRemovedListener = null));
    this.relevantTabIds.clear();
  }

  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  hasActiveListeners(): boolean {
    return (
      null !== this.chromeUpdateListener ||
      null !== this.chromeActivatedListener ||
      null !== this.chromeRemovedListener
    );
  }
}

export const getTabEventManager = (): TabEventManager => TabEventManager.getInstance();
