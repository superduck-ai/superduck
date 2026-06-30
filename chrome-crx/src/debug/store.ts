/**
 * Debug persistence layer.
 *
 * Two implementations:
 * - IndexedDbDebugStore: production, survives service-worker restarts, shared
 *   across sidepanel + service worker (same extension origin).
 * - InMemoryDebugStore: tests + fallback when IndexedDB is unavailable.
 *
 * The recorder writes events to the ring buffer synchronously and persists to
 * the store fire-and-forget. Store failures must never surface to the caller.
 */

import type { DebugArtifact, DebugBaseEvent, DebugDomain, DebugSessionMeta } from './schema';

const DB_NAME = 'superduck-debug';
const DB_VERSION = 1;
const EVENT_STORE = 'events';
const ARTIFACT_STORE = 'artifacts';
const ARTIFACT_CONTENT_STORE = 'artifactContent';
const SESSION_STORE = 'sessions';

export interface DebugStore {
  appendEvent(event: DebugBaseEvent): Promise<void>;
  getEvents(): Promise<DebugBaseEvent[]>;
  getEventsByDomain(domain: DebugDomain): Promise<DebugBaseEvent[]>;
  clearEvents(): Promise<void>;
  putArtifact(artifact: DebugArtifact, content?: unknown): Promise<void>;
  getArtifact(id: string): Promise<DebugArtifact | undefined>;
  getArtifactContent(id: string): Promise<unknown | undefined>;
  listArtifacts(): Promise<DebugArtifact[]>;
  clearArtifacts(): Promise<void>;
  putSession(meta: DebugSessionMeta): Promise<void>;
  getSession(id: string): Promise<DebugSessionMeta | undefined>;
  listSessions(): Promise<DebugSessionMeta[]>;
  deleteSession(id: string): Promise<void>;
  clear(): Promise<void>;
  close(): void;
}

export class InMemoryDebugStore implements DebugStore {
  private events: DebugBaseEvent[] = [];
  private artifacts = new Map<string, DebugArtifact>();
  private artifactContent = new Map<string, unknown>();
  private sessions = new Map<string, DebugSessionMeta>();

  async appendEvent(event: DebugBaseEvent): Promise<void> {
    this.events.push(event);
  }
  async getEvents(): Promise<DebugBaseEvent[]> {
    return [...this.events];
  }
  async getEventsByDomain(domain: DebugDomain): Promise<DebugBaseEvent[]> {
    return this.events.filter((e) => e.domain === domain);
  }
  async clearEvents(): Promise<void> {
    this.events = [];
  }
  async putArtifact(artifact: DebugArtifact, content?: unknown): Promise<void> {
    this.artifacts.set(artifact.id, artifact);
    if (content !== undefined) this.artifactContent.set(artifact.id, content);
  }
  async getArtifact(id: string): Promise<DebugArtifact | undefined> {
    return this.artifacts.get(id);
  }
  async getArtifactContent(id: string): Promise<unknown | undefined> {
    return this.artifactContent.get(id);
  }
  async listArtifacts(): Promise<DebugArtifact[]> {
    return [...this.artifacts.values()];
  }
  async clearArtifacts(): Promise<void> {
    this.artifacts.clear();
    this.artifactContent.clear();
  }
  async putSession(meta: DebugSessionMeta): Promise<void> {
    this.sessions.set(meta.debugSessionId, meta);
  }
  async getSession(id: string): Promise<DebugSessionMeta | undefined> {
    return this.sessions.get(id);
  }
  async listSessions(): Promise<DebugSessionMeta[]> {
    return [...this.sessions.values()];
  }
  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }
  async clear(): Promise<void> {
    await this.clearEvents();
    await this.clearArtifacts();
    this.sessions.clear();
  }
  close(): void {
    // no-op
  }
}

interface IDBDatabaseLike {
  name: string;
  version: number;
  objectStoreNames: DOMStringList;
  createObjectStore(name: string, options?: IDBObjectStoreParameters): IDBObjectStore;
  transaction(
    storeNames: string | string[],
    mode?: IDBTransactionMode,
    options?: IDBTransactionOptions
  ): IDBTransaction;
  close(): void;
}

export class IndexedDbDebugStore implements DebugStore {
  private dbPromise: Promise<IDBDatabaseLike> | null = null;

  constructor(private dbName: string = DB_NAME) {}

  private open(): Promise<IDBDatabaseLike> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabaseLike>((resolve, reject) => {
      const req = indexedDB.open(this.dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result as unknown as IDBDatabaseLike;
        if (!db.objectStoreNames.contains(EVENT_STORE)) {
          const store = db.createObjectStore(EVENT_STORE, { keyPath: 'eventId' });
          store.createIndex('by_domain', 'domain', { unique: false });
          store.createIndex('by_session', 'debugSessionId', { unique: false });
        }
        if (!db.objectStoreNames.contains(ARTIFACT_STORE)) {
          db.createObjectStore(ARTIFACT_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(ARTIFACT_CONTENT_STORE)) {
          db.createObjectStore(ARTIFACT_CONTENT_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(SESSION_STORE)) {
          db.createObjectStore(SESSION_STORE, { keyPath: 'debugSessionId' });
        }
      };
      req.onsuccess = () => resolve(req.result as unknown as IDBDatabaseLike);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private async txRW(store: string, fn: (s: IDBObjectStore) => IDBRequest): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = fn(tx.objectStore(store));
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
    });
  }

  private async txRead<T>(
    store: string,
    fn: (s: IDBObjectStore | IDBIndex) => IDBRequest,
    indexName?: string
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const target = indexName ? tx.objectStore(store).index(indexName) : tx.objectStore(store);
      const req = fn(target);
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
    });
  }

  async appendEvent(event: DebugBaseEvent): Promise<void> {
    await this.txRW(EVENT_STORE, (s) => s.add(event));
  }
  async getEvents(): Promise<DebugBaseEvent[]> {
    return this.txRead<DebugBaseEvent[]>(EVENT_STORE, (s) => s.getAll());
  }
  async getEventsByDomain(domain: DebugDomain): Promise<DebugBaseEvent[]> {
    return this.txRead<DebugBaseEvent[]>(EVENT_STORE, (s) => s.getAll(domain), 'by_domain');
  }
  async clearEvents(): Promise<void> {
    await this.txRW(EVENT_STORE, (s) => s.clear());
  }
  async putArtifact(artifact: DebugArtifact, content?: unknown): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([ARTIFACT_STORE, ARTIFACT_CONTENT_STORE], 'readwrite');
      tx.objectStore(ARTIFACT_STORE).put(artifact);
      if (content !== undefined) {
        tx.objectStore(ARTIFACT_CONTENT_STORE).put({ id: artifact.id, content });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async getArtifact(id: string): Promise<DebugArtifact | undefined> {
    return this.txRead<DebugArtifact | undefined>(ARTIFACT_STORE, (s) => s.get(id));
  }
  async getArtifactContent(id: string): Promise<unknown | undefined> {
    const row = await this.txRead<{ id: string; content: unknown } | undefined>(
      ARTIFACT_CONTENT_STORE,
      (s) => s.get(id)
    );
    return row?.content;
  }
  async listArtifacts(): Promise<DebugArtifact[]> {
    return this.txRead<DebugArtifact[]>(ARTIFACT_STORE, (s) => s.getAll());
  }
  async clearArtifacts(): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([ARTIFACT_STORE, ARTIFACT_CONTENT_STORE], 'readwrite');
      tx.objectStore(ARTIFACT_STORE).clear();
      tx.objectStore(ARTIFACT_CONTENT_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async putSession(meta: DebugSessionMeta): Promise<void> {
    await this.txRW(SESSION_STORE, (s) => s.put(meta));
  }
  async getSession(id: string): Promise<DebugSessionMeta | undefined> {
    return this.txRead<DebugSessionMeta | undefined>(SESSION_STORE, (s) => s.get(id));
  }
  async listSessions(): Promise<DebugSessionMeta[]> {
    return this.txRead<DebugSessionMeta[]>(SESSION_STORE, (s) => s.getAll());
  }
  async deleteSession(id: string): Promise<void> {
    await this.txRW(SESSION_STORE, (s) => s.delete(id));
  }
  async clear(): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [EVENT_STORE, ARTIFACT_STORE, ARTIFACT_CONTENT_STORE, SESSION_STORE],
        'readwrite'
      );
      for (const name of [EVENT_STORE, ARTIFACT_STORE, ARTIFACT_CONTENT_STORE, SESSION_STORE]) {
        tx.objectStore(name).clear();
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  close(): void {
    if (this.dbPromise) {
      const p = this.dbPromise;
      this.dbPromise = null;
      p.then((db) => db.close()).catch(() => {});
    }
  }
}

export function createDefaultStore(): DebugStore {
  if (typeof indexedDB !== 'undefined') {
    return new IndexedDbDebugStore();
  }
  return new InMemoryDebugStore();
}
