export type PendingDeleteSnapshot = Map<string, number>;

export class PendingDeleteSet {
  private readonly versions = new Map<string, number>();

  mark(key: string, revision: number): void {
    this.versions.set(key, revision);
  }

  clear(key: string): void {
    this.versions.delete(key);
  }

  applyTo<T>(state: Record<string, T>): Record<string, T> {
    for (const key of this.versions.keys()) {
      delete state[key];
    }
    return state;
  }

  snapshot(): PendingDeleteSnapshot {
    return new Map(this.versions);
  }

  clearPersisted<T>(snapshot: PendingDeleteSnapshot, currentState: Record<string, T>): void {
    void snapshot;
    void currentState;
    // Keep tombstones for the lifetime of this store so a later stale storage
    // read cannot resurrect a deleted deadline. A same-process set() clears
    // the key explicitly when a new deadline is scheduled.
  }
}
