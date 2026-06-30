const snapshotLocks = new Map<number, Promise<unknown>>();

chrome.tabs.onRemoved.addListener((tabId) => {
  snapshotLocks.delete(tabId);
});

export async function withSnapshotLock<T>(tabId: number, fn: () => Promise<T>): Promise<T> {
  const prev = snapshotLocks.get(tabId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const chained = prev.then(() => gate);
  snapshotLocks.set(tabId, chained);
  try {
    await prev;
    return await fn();
  } finally {
    release();
    if (snapshotLocks.get(tabId) === chained) {
      snapshotLocks.delete(tabId);
    }
  }
}
