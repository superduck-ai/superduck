import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InMemoryDebugStore } from '@/debug/store';

const cdpMock = vi.hoisted(() => ({
  sendCommand: vi.fn(),
  screenshot: vi.fn()
}));

vi.mock('../cdp', () => ({
  cdpDebugger: {
    sendCommand: cdpMock.sendCommand,
    screenshot: cdpMock.screenshot
  }
}));

vi.mock('../axSnapshot', () => ({
  withSnapshotLock: vi.fn(async (_tabId: number, fn: () => Promise<unknown>) => fn()),
  INTERACTIVE_ROLES: new Set(['button', 'link', 'textbox']),
  CONTENT_ROLES: new Set(['heading', 'cell']),
  takeSnapshotUnlocked: vi.fn(),
  SnapshotMaxCharsError: class SnapshotMaxCharsError extends Error {}
}));

describe('screenshot-ref debug instrumentation', () => {
  let store: InMemoryDebugStore;

  beforeEach(async () => {
    vi.resetModules();
    cdpMock.sendCommand.mockReset();
    cdpMock.screenshot.mockReset();
    cdpMock.sendCommand.mockResolvedValue({});
    cdpMock.screenshot.mockResolvedValue({ base64: 'png', format: 'png' });
    vi.stubGlobal('chrome', {
      scripting: {
        executeScript: vi.fn(async () => [{ result: [] }])
      },
      tabs: {
        onRemoved: { addListener: vi.fn() }
      },
      webNavigation: {
        onCommitted: { addListener: vi.fn() }
      }
    });
    const { InMemoryDebugStore } = await import('@/debug/store');
    const { startDebugSession } = await import('@/debug/recorder');
    store = new InMemoryDebugStore();
    await startDebugSession({ store });
  });

  afterEach(async () => {
    const { resetDebugRecorder } = await import('@/debug/recorder');
    resetDebugRecorder();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  async function refEvents() {
    const evts = await store.getEvents();
    return evts.filter((e) => e.domain === 'screenshot-ref');
  }

  it('registerRefsInPage records ref.register.start/end', async () => {
    cdpMock.sendCommand.mockResolvedValue({ object: { objectId: 'obj-1' } });
    const { registerRefsInPage } = await import('./refBridge');
    await registerRefsInPage(1, [
      {
        refId: 'ref_1',
        backendNodeId: 100,
        role: 'button',
        name: 'OK',
        interactiveOnly: true
      } as never
    ]);
    const events = await refEvents();
    const names = events.map((e) => e.event);
    expect(names).toContain('ref.register.start');
    expect(names).toContain('ref.register.end');
    const start = events.find((e) => e.event === 'ref.register.start')!;
    expect(start.data?.refCount).toBe(1);
    expect(start.data?.interactiveCount).toBe(1);
  });

  it('clearPageRefs records ref.clear', async () => {
    const { clearPageRefs } = await import('./refBridge');
    await clearPageRefs(2);
    const events = await refEvents();
    expect(events.find((e) => e.event === 'ref.clear')).toBeDefined();
  });

  it('pruneStaleRefs records ref.prune with prunedCount', async () => {
    const { pruneStaleRefs } = await import('./refBridge');
    await pruneStaleRefs(3);
    const events = await refEvents();
    const prune = events.find((e) => e.event === 'ref.prune');
    expect(prune).toBeDefined();
    expect(prune?.data?.prunedCount).toBe(0);
  });

  it('resolveStaleRef records ref.resolve_stale.end with no_meta when ref unknown', async () => {
    const { resolveStaleRef } = await import('./refBridge');
    const ok = await resolveStaleRef(4, 'ref_unknown');
    expect(ok).toBe(false);
    const events = await refEvents();
    const end = events.find((e) => e.event === 'ref.resolve_stale.end');
    expect(end).toBeDefined();
    expect(end?.data?.success).toBe(false);
    expect(end?.data?.reason).toBe('no_meta');
  });

  it('captureAnnotatedScreenshot records screenshot.annotate.end refMetaEmpty when no refs', async () => {
    const { captureAnnotatedScreenshot } = await import('./annotatedScreenshot');
    const result = await captureAnnotatedScreenshot(5);
    expect(result).toBeNull();
    const events = await refEvents();
    const end = events.find((e) => e.event === 'screenshot.annotate.end');
    expect(end).toBeDefined();
    expect(end?.data?.refMetaEmpty).toBe(true);
    expect(end?.data?.annotationCount).toBe(0);
  });

  it('captureAnnotatedScreenshot records contentQuadsAllFailed when quads fail', async () => {
    cdpMock.sendCommand.mockImplementation(async (_t: unknown, method: string) => {
      if (method === 'DOM.resolveNode') return { object: { objectId: 'obj-1' } };
      if (method === 'DOM.getContentQuads') throw new Error('quads failed');
      return {};
    });
    const { registerRefsInPage } = await import('./refBridge');
    await registerRefsInPage(6, [
      {
        refId: 'ref_1',
        backendNodeId: 100,
        role: 'button',
        name: 'OK',
        interactiveOnly: true
      } as never
    ]);
    const { captureAnnotatedScreenshot } = await import('./annotatedScreenshot');
    const result = await captureAnnotatedScreenshot(6);
    expect(result).toBeNull();
    const events = await refEvents();
    const end = events.find(
      (e) => e.event === 'screenshot.annotate.end' && e.data?.refMetaEmpty === false
    );
    expect(end).toBeDefined();
    expect(end?.data?.contentQuadsAllFailed).toBe(true);
    expect(end?.data?.annotationCount).toBe(0);
  });

  it('captureAnnotatedScreenshot records annotationCount on success', async () => {
    cdpMock.sendCommand.mockImplementation(async (_t: unknown, method: string) => {
      if (method === 'DOM.resolveNode') return { object: { objectId: 'obj-1' } };
      if (method === 'DOM.getContentQuads') return { quads: [[0, 0, 10, 0, 10, 10, 0, 10]] };
      return {};
    });
    const { registerRefsInPage } = await import('./refBridge');
    await registerRefsInPage(7, [
      {
        refId: 'ref_1',
        backendNodeId: 100,
        role: 'button',
        name: 'OK',
        interactiveOnly: true
      } as never
    ]);
    const { captureAnnotatedScreenshot } = await import('./annotatedScreenshot');
    const result = await captureAnnotatedScreenshot(7);
    expect(result).not.toBeNull();
    expect(result?.annotations).toHaveLength(1);
    const events = await refEvents();
    const end = events.find(
      (e) => e.event === 'screenshot.annotate.end' && e.data?.annotationCount === 1
    );
    expect(end).toBeDefined();
  });

  it('does not record screenshot-ref events when debug is disabled', async () => {
    const { resetDebugRecorder } = await import('@/debug/recorder');
    resetDebugRecorder();
    const { clearPageRefs } = await import('./refBridge');
    await clearPageRefs(8);
    const events = await refEvents();
    expect(events).toHaveLength(0);
  });
});
