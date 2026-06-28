/**
 * Debug recorder — the single entry point all domains call.
 *
 * Contract:
 * - When debug is disabled, every entry point is a near no-op (one boolean
 *   check, no allocation).
 * - When debug is enabled, events hit the in-memory ring buffer synchronously
 *   and are persisted to the store fire-and-forget. Store failures are
 *   swallowed and never surface to the business path.
 * - All `data` payloads pass through redaction before being recorded.
 */

import type {
  DebugArtifact,
  DebugArtifactRef,
  DebugArtifactType,
  DebugBaseEvent,
  DebugDomain,
  DebugIds,
  DebugLevel,
  DebugSessionMeta
} from './schema';
import { DEBUG_SCHEMA_VERSION } from './schema';
import { RingBuffer } from './ringBuffer';
import { redactValue, sha256Hex, redactArtifactData, type RedactionOptions } from './redaction';
import { getRuntimeSessionId, newDebugSessionId, resetRuntimeSessionId } from './session';
import { createDefaultStore, type DebugStore } from './store';
import { buildBundle, type DebugBundle } from './exportBundle';

const DEFAULT_RING_BUFFER_CAPACITY = 5000;
const MAX_ARTIFACT_BYTES = 20 * 1024 * 1024;
const MAX_INLINE_DATA_BYTES = 64 * 1024;

export interface DebugEventInput {
  domain: DebugDomain;
  event: string;
  level?: DebugLevel;
  ids?: DebugIds;
  data?: Record<string, unknown>;
  artifactRefs?: DebugArtifactRef[];
  durationMs?: number;
  error?: { message: string; name?: string; stack?: string };
}

export interface StartDebugSessionOptions {
  store?: DebugStore;
  ringBufferCapacity?: number;
  extensionVersion?: string;
  browser?: string;
  nativeHostVersion?: string;
  note?: string;
  redactionOptions?: RedactionOptions;
  includeSensitivePayloads?: boolean;
}

export interface RecordArtifactInput {
  type: DebugArtifactType;
  ids?: DebugIds;
  mimeType: string;
  data?: unknown;
  content?: unknown;
  redacted?: boolean;
}

export interface DebugStatus {
  enabled: boolean;
  session: DebugSessionMeta | null;
  ringBufferLength: number;
  persistedEventCount: number;
  artifactCount: number;
}

let enabled = false;
let session: DebugSessionMeta | null = null;
let ringBuffer: RingBuffer<DebugBaseEvent> | null = null;
let store: DebugStore | null = null;
let redactionOptions: RedactionOptions = {};
let sessionStartedAtMs = 0;
let monotonicOrigin = 0;
let extensionVersion = '';
let browserInfo: string | undefined;
let nativeHostVersion: string | undefined;
let sessionNote: string | undefined;
let persistedEventCount = 0;

const DEBUG_ENABLED_KEY = 'DEBUG_EVIDENCE_ENABLED';
const DEBUG_SESSION_KEY = 'DEBUG_SESSION_META';
const DEBUG_PERSISTENT_KEY = 'DEBUG_EVIDENCE_PERSISTENT';

function manifestVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return '';
  }
}

/**
 * Cross-context enabled sync + persistent auto-start.
 *
 * Three cases:
 * 1. Another context (service worker) already started a session this SW
 *    lifetime — attach to its debugSessionId (sidepanel/content script case).
 * 2. Persistent mode is on (set via `superduck debug enable`) and no session
 *    is active — auto-start a fresh session so a crash/bug that happens
 *    before the user runs `debug start` is still captured.
 * 3. Nothing configured — stay disabled (default, near-zero overhead).
 */
function tryInitFromStorage(): void {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    chrome.storage.local.get(
      [DEBUG_ENABLED_KEY, DEBUG_SESSION_KEY, DEBUG_PERSISTENT_KEY],
      (result) => {
        if (chrome.runtime.lastError) return;
        const alreadyEnabled = result[DEBUG_ENABLED_KEY] === true;
        const meta = result[DEBUG_SESSION_KEY] as DebugSessionMeta | undefined;
        const persistent = result[DEBUG_PERSISTENT_KEY] === true;

        if (alreadyEnabled && meta && !enabled) {
          enabled = true;
          store = createDefaultStore();
          ringBuffer = new RingBuffer<DebugBaseEvent>(DEFAULT_RING_BUFFER_CAPACITY);
          redactionOptions = {};
          monotonicOrigin = Date.now();
          session = { ...meta, runtimeSessionId: getRuntimeSessionId() };
        } else if (persistent && !enabled) {
          void startDebugSession({ extensionVersion: manifestVersion() });
        }
      }
    );
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area !== 'local') return;
      if (DEBUG_ENABLED_KEY in changes && changes[DEBUG_ENABLED_KEY]?.newValue === false) {
        enabled = false;
      }
    });
  } catch {
    // ignore — storage unavailable
  }
}

tryInitFromStorage();

function persistEnabledFlag(enabledFlag: boolean, meta?: DebugSessionMeta): void {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    const payload: Record<string, unknown> = { [DEBUG_ENABLED_KEY]: enabledFlag };
    if (meta) payload[DEBUG_SESSION_KEY] = meta;
    chrome.storage.local.set(payload);
  } catch {
    // ignore
  }
}

/** Turn persistent auto-start on/off (`superduck debug enable` / `disable`). */
export async function setPersistentDebug(flag: boolean): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    await chrome.storage.local.set({ [DEBUG_PERSISTENT_KEY]: flag });
    if (!flag) {
      persistEnabledFlag(false);
    }
  } catch {
    // ignore
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function monotonicMs(): number {
  if (!monotonicOrigin) return 0;
  return Date.now() - monotonicOrigin;
}

function nextEventId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) {
    try {
      return c.randomUUID();
    } catch {
      // fall through
    }
  }
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function toErrorPayload(err: unknown): { message: string; name?: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, name: err.name, stack: err.stack };
  }
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const m = (err as { message: unknown }).message;
    return { message: typeof m === 'string' ? m : String(m) };
  }
  return { message: String(err) };
}

export function isDebugEnabled(): boolean {
  return enabled;
}

export function getDebugSession(): DebugSessionMeta | null {
  return session;
}

export function getRedactionOptions(): RedactionOptions {
  return redactionOptions;
}

export function getDebugStore(): DebugStore | null {
  return store;
}

export function getDebugStatus(): DebugStatus {
  return {
    enabled,
    session,
    ringBufferLength: ringBuffer?.length ?? 0,
    persistedEventCount,
    artifactCount: 0
  };
}

export async function startDebugSession(
  opts: StartDebugSessionOptions = {}
): Promise<DebugSessionMeta> {
  if (enabled && session) return session;
  resetForStart();
  enabled = true;
  store = opts.store ?? createDefaultStore();
  ringBuffer = new RingBuffer<DebugBaseEvent>(
    opts.ringBufferCapacity ?? DEFAULT_RING_BUFFER_CAPACITY
  );
  redactionOptions = {
    ...opts.redactionOptions,
    includeSensitivePayloads: opts.includeSensitivePayloads
  };
  extensionVersion = opts.extensionVersion ?? '';
  browserInfo = opts.browser;
  nativeHostVersion = opts.nativeHostVersion;
  sessionNote = opts.note;
  const debugSessionId = newDebugSessionId();
  const runtimeSessionId = getRuntimeSessionId();
  sessionStartedAtMs = Date.now();
  monotonicOrigin = sessionStartedAtMs;
  persistedEventCount = 0;
  session = {
    debugSessionId,
    runtimeSessionId,
    startedAt: nowIso(),
    extensionVersion,
    browser: browserInfo,
    nativeHostVersion,
    eventCount: 0,
    artifactCount: 0
  };
  await persistSession();
  persistEnabledFlag(true, session);
  recordEvent({
    domain: 'diagnosis',
    event: 'debug.session.start',
    level: 'info',
    data: {
      debugSessionId,
      runtimeSessionId,
      extensionVersion,
      browser: browserInfo,
      note: sessionNote
    }
  });
  return session;
}

function resetForStart(): void {
  ringBuffer = null;
  // do not close an externally-injected store; only close one we created
  store = null;
  persistedEventCount = 0;
}

export async function stopDebugSession(): Promise<DebugSessionMeta | null> {
  if (!enabled || !session) return null;
  recordEvent({
    domain: 'diagnosis',
    event: 'debug.session.stop',
    level: 'info',
    data: { eventCount: session.eventCount, artifactCount: session.artifactCount }
  });
  const ended = nowIso();
  const finalMeta: DebugSessionMeta = {
    ...session,
    endedAt: ended,
    eventCount: session.eventCount,
    artifactCount: session.artifactCount
  };
  session = finalMeta;
  await persistSession();
  persistEnabledFlag(false);
  const result = finalMeta;
  enabled = false;
  ringBuffer = null;
  // keep `store` so exportDebugBundle() can still read the just-stopped session
  session = null;
  return result;
}

async function persistSession(): Promise<void> {
  if (!store || !session) return;
  try {
    await store.putSession(session);
  } catch {
    // swallow
  }
}

export function recordEvent(input: DebugEventInput): void {
  if (!enabled || !session) return;
  try {
    const event: DebugBaseEvent = {
      schemaVersion: DEBUG_SCHEMA_VERSION,
      eventId: nextEventId(),
      ts: nowIso(),
      monotonicMs: monotonicMs(),
      debugSessionId: session.debugSessionId,
      domain: input.domain,
      event: input.event,
      level: input.level ?? 'info',
      ids: { runtimeSessionId: session.runtimeSessionId, ...input.ids }
    };
    if (input.data) {
      event.data = redactValue(input.data, redactionOptions) as Record<string, unknown>;
    }
    if (input.artifactRefs && input.artifactRefs.length > 0) {
      event.artifactRefs = input.artifactRefs;
    }
    if (input.durationMs !== undefined) event.durationMs = input.durationMs;
    if (input.error) event.error = input.error;
    ringBuffer?.push(event);
    session.eventCount++;
    const s = store;
    if (s) {
      void s.appendEvent(event).then(
        () => {
          persistedEventCount++;
        },
        () => {
          // swallow store failure
        }
      );
    }
  } catch {
    // never let debug break business
  }
}

export function recordError(
  domain: DebugDomain,
  event: string,
  err: unknown,
  ids?: DebugIds,
  data?: Record<string, unknown>
): void {
  if (!enabled) return;
  recordEvent({ domain, event, level: 'error', ids, data, error: toErrorPayload(err) });
}

function measureBytes(content: unknown): number {
  if (content == null) return 0;
  if (typeof content === 'string') {
    try {
      return new TextEncoder().encode(content).byteLength;
    } catch {
      return content.length;
    }
  }
  if (content instanceof ArrayBuffer) return content.byteLength;
  if (ArrayBuffer.isView(content)) return (content as ArrayBufferView).byteLength;
  try {
    return new TextEncoder().encode(JSON.stringify(content)).byteLength;
  } catch {
    return 0;
  }
}

function contentToStorable(content: unknown): unknown {
  if (content == null) return undefined;
  if (typeof content === 'string') return content;
  if (content instanceof ArrayBuffer) return content;
  if (ArrayBuffer.isView(content)) return content;
  return content;
}

export async function recordArtifact(input: RecordArtifactInput): Promise<DebugArtifactRef | null> {
  if (!enabled || !session) return null;
  try {
    const s = store;
    if (!s) return null;
    const id = nextEventId();
    const createdAt = nowIso();
    const { data: redactedData, redacted } = redactArtifactData(
      input.data,
      input.type,
      redactionOptions
    );
    const contentBytes = measureBytes(input.content);
    const dataBytes = measureBytes(redactedData);
    const totalBytes = contentBytes || dataBytes;
    const truncated = totalBytes > MAX_ARTIFACT_BYTES;
    const shaInput =
      input.content != null
        ? input.content instanceof ArrayBuffer
          ? input.content
          : typeof input.content === 'string'
            ? input.content
            : JSON.stringify(input.content)
        : JSON.stringify(redactedData);
    const sha256 = await sha256Hex(shaInput as string | ArrayBuffer | Uint8Array);
    const artifact: DebugArtifact = {
      id,
      type: input.type,
      createdAt,
      ids: { runtimeSessionId: session.runtimeSessionId, ...input.ids },
      mimeType: input.mimeType,
      byteLength: truncated ? MAX_ARTIFACT_BYTES : totalBytes,
      sha256,
      redacted: input.redacted ?? redacted,
      ...(dataBytes > 0 && dataBytes <= MAX_INLINE_DATA_BYTES ? { data: redactedData } : {})
    };
    if (truncated) {
      (artifact as DebugArtifact & { truncated: boolean }).truncated = true;
    }
    let storedContent: unknown = input.content;
    if (truncated) {
      if (typeof input.content === 'string') {
        storedContent = input.content.slice(0, MAX_ARTIFACT_BYTES);
      } else {
        storedContent = `[truncated: content exceeded ${MAX_ARTIFACT_BYTES} bytes]`;
      }
    }
    await s.putArtifact(artifact, contentToStorable(storedContent));
    session.artifactCount++;
    await persistSession();
    const ref: DebugArtifactRef = { id, type: input.type };
    // Record a linking event so the event stream references this artifact.
    // Without it, an agent reading events/*.jsonl has no way to discover that
    // a screenshot / AX text / JS output artifact exists for a given toolUseId.
    recordEvent({
      domain: 'diagnosis',
      event: 'artifact.recorded',
      ids: input.ids,
      data: {
        artifactType: input.type,
        mimeType: input.mimeType,
        byteLength: artifact.byteLength,
        sha256,
        truncated
      },
      artifactRefs: [ref]
    });
    return ref;
  } catch {
    return null;
  }
}

export function withDebugSpan<T>(
  domain: DebugDomain,
  event: string,
  ids: DebugIds | undefined,
  fn: () => T,
  options?: { level?: DebugLevel; data?: Record<string, unknown> }
): T {
  if (!enabled) return fn();
  const start = Date.now();
  recordEvent({
    domain,
    event: `${event}.start`,
    ids,
    level: options?.level ?? 'debug',
    data: options?.data
  });
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(
        (v) => {
          recordEvent({
            domain,
            event: `${event}.end`,
            ids,
            durationMs: Date.now() - start
          });
          return v;
        },
        (err) => {
          recordEvent({
            domain,
            event: `${event}.end`,
            ids,
            durationMs: Date.now() - start,
            level: 'error',
            error: toErrorPayload(err)
          });
          throw err;
        }
      ) as T;
    }
    recordEvent({ domain, event: `${event}.end`, ids, durationMs: Date.now() - start });
    return result;
  } catch (err) {
    recordEvent({
      domain,
      event: `${event}.end`,
      ids,
      durationMs: Date.now() - start,
      level: 'error',
      error: toErrorPayload(err)
    });
    throw err;
  }
}

export function getRingBufferEvents(): DebugBaseEvent[] {
  return ringBuffer?.toArray() ?? [];
}

export async function getEvents(): Promise<DebugBaseEvent[]> {
  if (!store) return ringBuffer?.toArray() ?? [];
  try {
    return await store.getEvents();
  } catch {
    return ringBuffer?.toArray() ?? [];
  }
}

export async function getEventsByDomain(domain: DebugDomain): Promise<DebugBaseEvent[]> {
  if (!store) return [];
  try {
    return await store.getEventsByDomain(domain);
  } catch {
    return [];
  }
}

export async function getArtifacts(): Promise<DebugArtifact[]> {
  if (!store) return [];
  try {
    return await store.listArtifacts();
  } catch {
    return [];
  }
}

export async function getArtifactContent(id: string): Promise<unknown | undefined> {
  if (!store) return undefined;
  try {
    return await store.getArtifactContent(id);
  } catch {
    return undefined;
  }
}

export async function exportDebugBundle(): Promise<DebugBundle | null> {
  const s = store;
  if (!s) return null;
  let meta = session;
  if (!meta) {
    try {
      const sessions = await s.listSessions();
      if (sessions.length === 0) return null;
      meta = sessions[sessions.length - 1];
    } catch {
      return null;
    }
  }
  const events = await getEvents();
  const artifacts = await getArtifacts();
  const artifactsWithContent = await Promise.all(
    artifacts.map(async (a) => {
      const content = await s.getArtifactContent(a.id);
      return { ...a, content: content ?? undefined };
    })
  );
  return buildBundle(events, artifactsWithContent, meta);
}

/** Test-only: tear down all module state without touching chrome.storage. */
export function resetDebugRecorder(): void {
  try {
    store?.close();
  } catch {
    // ignore
  }
  enabled = false;
  session = null;
  ringBuffer = null;
  store = null;
  redactionOptions = {};
  sessionStartedAtMs = 0;
  monotonicOrigin = 0;
  extensionVersion = '';
  browserInfo = undefined;
  nativeHostVersion = undefined;
  sessionNote = undefined;
  persistedEventCount = 0;
  resetRuntimeSessionId();
}
