import { getStorageValue, setStorageValue } from '../extensionServices';
import { PendingDeleteSet, type PendingDeleteSnapshot } from './pendingDeleteSet';

export type DeadlineState<K extends string, R> = Record<K, Record<string, R>>;

export interface PersistentDeadlineStoreOptions<K extends string, R> {
  storageKey: string;
  kinds: readonly K[];
  emptyState: DeadlineState<K, R>;
  loadState: (stored: unknown) => DeadlineState<K, R>;
  serializeState?: (state: DeadlineState<K, R>) => unknown;
  warnLabel?: string;
}

function cloneState<K extends string, R>(kinds: readonly K[], state: DeadlineState<K, R>) {
  const next = {} as DeadlineState<K, R>;
  for (const kind of kinds) next[kind] = { ...state[kind] };
  return next;
}

export class PersistentDeadlineStore<K extends string, R> {
  readonly kinds: readonly K[];
  readonly storageKey: string;
  private readonly emptyState: DeadlineState<K, R>;
  private readonly loadState: (stored: unknown) => DeadlineState<K, R>;
  private readonly serializeState: (state: DeadlineState<K, R>) => unknown;
  private readonly warnLabel: string;
  private pendingDeletes: Record<K, PendingDeleteSet>;
  private revision = 0;
  state: DeadlineState<K, R>;

  constructor(options: PersistentDeadlineStoreOptions<K, R>) {
    this.kinds = options.kinds;
    this.storageKey = options.storageKey;
    this.emptyState = cloneState(options.kinds, options.emptyState);
    this.loadState = options.loadState;
    this.serializeState =
      options.serializeState ?? ((state: DeadlineState<K, R>) => cloneState(this.kinds, state));
    this.warnLabel = options.warnLabel ?? options.storageKey;
    this.state = cloneState(this.kinds, this.emptyState);
    this.pendingDeletes = {} as Record<K, PendingDeleteSet>;
    for (const kind of this.kinds) this.pendingDeletes[kind] = new PendingDeleteSet();
  }

  reset(): void {
    this.state = cloneState(this.kinds, this.emptyState);
    this.pendingDeletes = {} as Record<K, PendingDeleteSet>;
    for (const kind of this.kinds) this.pendingDeletes[kind] = new PendingDeleteSet();
    this.revision = 0;
  }

  async refresh(): Promise<void> {
    const revisionBeforeLoad = this.revision;
    const loaded = await this.load();
    const next =
      this.revision === revisionBeforeLoad ? loaded : this.mergeLoadedStateWithLocal(loaded);
    this.state = this.applyPendingDeletes(next);
  }

  get(kind: K, key: string): R | undefined {
    return this.state[kind][key];
  }

  entries(kind: K): [string, R][] {
    return Object.entries(this.state[kind]) as [string, R][];
  }

  set(kind: K, key: string, record: R): void {
    this.revision++;
    const byKey = this.state[kind] as Record<string, R>;
    byKey[key] = record;
    this.pendingDeletes[kind].clear(key);
    void this.persist();
  }

  remove(kind: K, key: string): R | undefined {
    const byKey = this.state[kind] as Record<string, R>;
    const record = byKey[key];
    if (!record) return undefined;
    this.revision++;
    delete byKey[key];
    this.pendingDeletes[kind].mark(key, this.revision);
    void this.persist();
    return record;
  }

  removeWhere(predicate: (kind: K, key: string, record: R) => boolean): [K, string, R][] {
    const removed: [K, string, R][] = [];
    for (const kind of this.kinds) {
      for (const [key, record] of this.entries(kind)) {
        if (!predicate(kind, key, record)) continue;
        this.revision++;
        const byKey = this.state[kind] as Record<string, R>;
        delete byKey[key];
        this.pendingDeletes[kind].mark(key, this.revision);
        removed.push([kind, key, record]);
      }
    }
    if (removed.length > 0) void this.persist();
    return removed;
  }

  async persist(): Promise<void> {
    const stateToPersist = cloneState(this.kinds, this.state);
    const deleteSnapshot = this.clonePendingDeletes();
    try {
      await setStorageValue(this.storageKey, this.serializeState(stateToPersist));
      this.clearPersistedDeletes(deleteSnapshot);
    } catch (err) {
      console.warn(`[core] failed to persist ${this.warnLabel}`, err);
    }
  }

  private async load(): Promise<DeadlineState<K, R>> {
    try {
      const stored = await getStorageValue<unknown>(this.storageKey);
      return this.loadState(stored);
    } catch (err) {
      console.warn(`[core] failed to load ${this.warnLabel}`, err);
      return cloneState(this.kinds, this.emptyState);
    }
  }

  private mergeLoadedStateWithLocal(loaded: DeadlineState<K, R>): DeadlineState<K, R> {
    const next = cloneState(this.kinds, loaded);
    for (const kind of this.kinds) Object.assign(next[kind], this.state[kind]);
    return next;
  }

  private applyPendingDeletes(state: DeadlineState<K, R>): DeadlineState<K, R> {
    for (const kind of this.kinds) this.pendingDeletes[kind].applyTo(state[kind]);
    return state;
  }

  private clonePendingDeletes(): Record<K, PendingDeleteSnapshot> {
    const snapshot = {} as Record<K, PendingDeleteSnapshot>;
    for (const kind of this.kinds) snapshot[kind] = this.pendingDeletes[kind].snapshot();
    return snapshot;
  }

  private clearPersistedDeletes(snapshot: Record<K, PendingDeleteSnapshot>): void {
    for (const kind of this.kinds) {
      this.pendingDeletes[kind].clearPersisted(snapshot[kind], this.state[kind]);
    }
  }
}
