import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemoryDebugStore } from './store';
import {
  startDebugSession,
  stopDebugSession,
  recordEvent,
  recordArtifact,
  recordError,
  withDebugSpan,
  isDebugEnabled,
  getDebugStatus,
  getRingBufferEvents,
  getEvents,
  getArtifacts,
  resetDebugRecorder
} from './recorder';
import type { DebugArtifact, DebugBaseEvent } from './schema';

describe('debug recorder', () => {
  let store: InMemoryDebugStore;

  beforeEach(() => {
    store = new InMemoryDebugStore();
  });

  afterEach(() => {
    resetDebugRecorder();
  });

  it('is a no-op when disabled', async () => {
    recordEvent({ domain: 'tool-runtime', event: 'tool.request.received' });
    expect(isDebugEnabled()).toBe(false);
    expect(getRingBufferEvents()).toHaveLength(0);
    expect(getDebugStatus().enabled).toBe(false);
  });

  it('start/stop produces a session meta', async () => {
    const meta = await startDebugSession({
      store,
      extensionVersion: '0.1.0',
      browser: 'Edge',
      note: 'unit'
    });
    expect(isDebugEnabled()).toBe(true);
    expect(meta.debugSessionId).toBeTruthy();
    expect(meta.runtimeSessionId).toBeTruthy();
    expect(meta.extensionVersion).toBe('0.1.0');
    expect(meta.browser).toBe('Edge');

    const stopped = await stopDebugSession();
    expect(stopped?.endedAt).toBeTruthy();
    expect(isDebugEnabled()).toBe(false);
  });

  it('records events to ring buffer + store with redaction', async () => {
    await startDebugSession({ store });
    recordEvent({
      domain: 'tool-runtime',
      event: 'tool.request.received',
      ids: { toolUseId: 'tu-1', tabId: 42 },
      data: { apiKey: 'secret', toolName: 'computer_screenshot', url: 'https://x.test/p?token=1' }
    });
    const ring = getRingBufferEvents();
    expect(ring).toHaveLength(2); // debug.session.start + tool.request.received
    const evt = ring[1] as DebugBaseEvent;
    expect(evt.domain).toBe('tool-runtime');
    expect(evt.event).toBe('tool.request.received');
    expect(evt.ids.toolUseId).toBe('tu-1');
    expect(evt.ids.tabId).toBe(42);
    expect(evt.ids.runtimeSessionId).toBeTruthy();
    expect(evt.data?.apiKey).toBe('[REDACTED]');
    expect(evt.data?.url).toBe('https://x.test/p?[redacted-query]');
    expect(evt.data?.toolName).toBe('computer_screenshot');
    expect(evt.debugSessionId).toBeTruthy();

    const persisted = await store.getEvents();
    expect(persisted.length).toBeGreaterThanOrEqual(2);
  });

  it('swallows store failures without breaking the caller', async () => {
    const failingStore = new InMemoryDebugStore();
    failingStore.appendEvent = async () => {
      throw new Error('disk full');
    };
    await startDebugSession({ store: failingStore });
    expect(() =>
      recordEvent({ domain: 'tool-runtime', event: 'tool.execute.start' })
    ).not.toThrow();
    expect(getRingBufferEvents().length).toBeGreaterThan(0);
  });

  it('recordEvent with circular data does not throw', async () => {
    await startDebugSession({ store });
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(() =>
      recordEvent({ domain: 'sidepanel', event: 'sidepanel.render.sample', data: { obj } })
    ).not.toThrow();
    const evt = getRingBufferEvents().at(-1) as DebugBaseEvent;
    expect((evt.data?.obj as Record<string, unknown>).self).toBe('[Circular]');
  });

  it('recordError captures error payload', async () => {
    await startDebugSession({ store });
    recordError('cdp', 'cdp.command.error', new Error('attach failed'), { tabId: 1 });
    const evt = getRingBufferEvents().at(-1) as DebugBaseEvent;
    expect(evt.level).toBe('error');
    expect(evt.error?.message).toBe('attach failed');
    expect(evt.error?.name).toBe('Error');
  });

  it('recordArtifact returns ref, computes sha256, enforces size limit', async () => {
    await startDebugSession({ store });
    const ref = await recordArtifact({
      type: 'screenshot',
      ids: { toolUseId: 'tu-1' },
      mimeType: 'image/png',
      content: 'fake-png-bytes'
    });
    expect(ref).not.toBeNull();
    expect(ref?.type).toBe('screenshot');
    const artifacts = await getArtifacts();
    expect(artifacts).toHaveLength(1);
    const a = artifacts[0];
    expect(a.sha256).toMatch(/^sha256-/);
    expect(a.byteLength).toBe('fake-png-bytes'.length);
    expect(a.redacted).toBe(true);
    const content = await store.getArtifactContent(a.id);
    expect(content).toBe('fake-png-bytes');
  });

  it('recordArtifact truncates content over the size limit', async () => {
    await startDebugSession({ store });
    const huge = 'x'.repeat(21 * 1024 * 1024);
    const ref = await recordArtifact({
      type: 'text',
      mimeType: 'text/plain',
      content: huge
    });
    expect(ref).not.toBeNull();
    const artifacts = await getArtifacts();
    const a = artifacts[0];
    expect((a as DebugArtifact & { truncated?: boolean }).truncated).toBe(true);
    const content = (await store.getArtifactContent(a.id)) as string;
    expect(content.length).toBeLessThanOrEqual(20 * 1024 * 1024);
  });

  it('withDebugSpan records start/end + duration for sync fn', async () => {
    await startDebugSession({ store });
    const result = withDebugSpan('tool-runtime', 'tool.execute', { requestId: 'r1' }, () => 42);
    expect(result).toBe(42);
    const events = getRingBufferEvents();
    const names = events.map((e) => e.event);
    expect(names).toContain('tool.execute.start');
    expect(names).toContain('tool.execute.end');
    const end = events.find((e) => e.event === 'tool.execute.end') as DebugBaseEvent;
    expect(typeof end.durationMs).toBe('number');
  });

  it('withDebugSpan records error on sync throw and re-throws', async () => {
    await startDebugSession({ store });
    expect(() =>
      withDebugSpan('cdp', 'cdp.command', { tabId: 1 }, () => {
        throw new Error('boom');
      })
    ).toThrow('boom');
    const end = getRingBufferEvents().find((e) => e.event === 'cdp.command.end') as DebugBaseEvent;
    expect(end.level).toBe('error');
    expect(end.error?.message).toBe('boom');
  });

  it('withDebugSpan supports async fn', async () => {
    await startDebugSession({ store });
    const result = await withDebugSpan(
      'javascript',
      'javascript.runtime.evaluate',
      undefined,
      async () => 'ok'
    );
    expect(result).toBe('ok');
    const events = getRingBufferEvents();
    expect(events.map((e) => e.event)).toContain('javascript.runtime.evaluate.end');
  });

  it('withDebugSpan async records error on rejection', async () => {
    await startDebugSession({ store });
    await expect(
      withDebugSpan('javascript', 'javascript.exec', undefined, async () => {
        throw new Error('async fail');
      })
    ).rejects.toThrow('async fail');
    const end = getRingBufferEvents().find(
      (e) => e.event === 'javascript.exec.end'
    ) as DebugBaseEvent;
    expect(end.level).toBe('error');
    expect(end.error?.message).toBe('async fail');
  });

  it('disabled withDebugSpan still runs the fn', () => {
    expect(withDebugSpan('cdp', 'x', undefined, () => 'ran')).toBe('ran');
    expect(getRingBufferEvents()).toHaveLength(0);
  });

  it('getEvents reads from store', async () => {
    await startDebugSession({ store });
    recordEvent({ domain: 'tab-state', event: 'tab.resolve.start' });
    const all = await getEvents();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('monotonicMs increases across events', async () => {
    await startDebugSession({ store });
    recordEvent({ domain: 'sidepanel', event: 'sidepanel.mount' });
    recordEvent({ domain: 'sidepanel', event: 'sidepanel.render.sample' });
    const events = getRingBufferEvents();
    const mount = events.find((e) => e.event === 'sidepanel.mount') as DebugBaseEvent;
    const sample = events.find((e) => e.event === 'sidepanel.render.sample') as DebugBaseEvent;
    expect(sample.monotonicMs ?? 0).toBeGreaterThanOrEqual(mount.monotonicMs ?? 0);
  });

  it('artifactRefs are linked on events', async () => {
    await startDebugSession({ store });
    const ref = await recordArtifact({
      type: 'ax-summary',
      mimeType: 'application/json',
      data: { nodeCount: 10 }
    });
    recordEvent({
      domain: 'screenshot-ref',
      event: 'ax.snapshot.end',
      ids: { toolUseId: 'tu-1' },
      artifactRefs: ref ? [ref] : undefined
    });
    const evt = getRingBufferEvents().find((e) => e.event === 'ax.snapshot.end') as DebugBaseEvent;
    expect(evt.artifactRefs?.[0]?.type).toBe('ax-summary');
  });

  it('recordArtifact auto-emits artifact.recorded linking event', async () => {
    await startDebugSession({ store });
    const ref = await recordArtifact({
      type: 'screenshot',
      ids: { toolUseId: 'tu-9', tabId: 3 },
      mimeType: 'image/png',
      content: 'png-bytes'
    });
    expect(ref).not.toBeNull();
    const events = getRingBufferEvents();
    const recorded = events.find((e) => e.event === 'artifact.recorded') as DebugBaseEvent;
    expect(recorded).toBeDefined();
    expect(recorded.domain).toBe('diagnosis');
    expect(recorded.ids.toolUseId).toBe('tu-9');
    expect(recorded.ids.tabId).toBe(3);
    expect(recorded.data?.artifactType).toBe('screenshot');
    expect(recorded.artifactRefs?.[0]?.id).toBe(ref?.id);
    expect(recorded.data?.sha256).toMatch(/^sha256-/);
  });
});
