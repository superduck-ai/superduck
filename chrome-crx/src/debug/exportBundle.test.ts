import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemoryDebugStore } from './store';
import {
  buildBundle,
  buildReadme,
  groupEventsByDomain,
  serializeBundleForTransport
} from './exportBundle';
import {
  startDebugSession,
  stopDebugSession,
  recordEvent,
  recordArtifact,
  exportDebugBundle,
  resetDebugRecorder
} from './recorder';
import type { DebugBaseEvent, DebugDomain, DebugSessionMeta } from './schema';

function mk(
  partial: Partial<DebugBaseEvent> & { domain: DebugDomain; event: string }
): DebugBaseEvent {
  return {
    schemaVersion: 1,
    eventId: partial.eventId ?? `e-${Math.random().toString(36).slice(2, 10)}`,
    ts: partial.ts ?? '2026-06-27T12:00:00.000Z',
    debugSessionId: 'session-1',
    domain: partial.domain,
    event: partial.event,
    level: partial.level ?? 'info',
    ids: partial.ids ?? {},
    data: partial.data,
    durationMs: partial.durationMs,
    error: partial.error
  };
}

const SESSION: DebugSessionMeta = {
  debugSessionId: 'session-1',
  runtimeSessionId: 'rt-1',
  startedAt: '2026-06-27T12:00:00.000Z',
  endedAt: '2026-06-27T12:01:00.000Z',
  extensionVersion: '0.1.0',
  browser: 'Edge',
  nativeHostVersion: '0.2.0',
  eventCount: 0,
  artifactCount: 0
};

describe('groupEventsByDomain', () => {
  it('groups events into per-domain buckets', () => {
    const events = [
      mk({ domain: 'tool-runtime', event: 'tool.execute.start' }),
      mk({ domain: 'cdp', event: 'cdp.attach.end' }),
      mk({ domain: 'tool-runtime', event: 'tool.execute.end' })
    ];
    const grouped = groupEventsByDomain(events);
    expect(grouped['tool-runtime']).toHaveLength(2);
    expect(grouped['cdp']).toHaveLength(1);
    expect(grouped['sidepanel']).toHaveLength(0);
  });
});

describe('buildBundle', () => {
  it('assembles a full bundle with summary, diagnosis, runtime map', () => {
    const events = [
      mk({
        domain: 'tool-runtime',
        event: 'tool.request.received',
        ids: { requestId: 'r-1', toolUseId: 'tu-1', nativeRequestId: 'n-1', tabId: 5 },
        data: { toolName: 'computer_screenshot' }
      }),
      mk({
        domain: 'cdp',
        event: 'cdp.attach.end',
        level: 'error',
        ids: { tabId: 5, requestId: 'r-1' },
        data: { url: 'https://example.com' }
      })
    ];
    const bundle = buildBundle(events, [], SESSION);
    expect(bundle.session.debugSessionId).toBe('session-1');
    expect(bundle.eventsByDomain['tool-runtime']).toHaveLength(1);
    expect(bundle.eventsByDomain.cdp).toHaveLength(1);
    expect(bundle.runtimeMap.tabs).toHaveLength(1);
    expect(bundle.runtimeMap.tabs[0].id).toBe('5');
    expect(bundle.diagnosis.findings.length).toBeGreaterThan(0);
    expect(bundle.summaryMarkdown).toContain('SuperDuck Debug Summary');
    expect(bundle.readme).toContain('summary.agent.md');
  });

  it('summary markdown lists session, findings, runtime map, errors, slow ops, files', () => {
    const events = [
      mk({
        domain: 'tool-runtime',
        event: 'tool.execute.end',
        ids: { requestId: 'r-1' },
        durationMs: 1200
      }),
      mk({
        domain: 'cdp',
        event: 'cdp.command.error',
        level: 'error',
        ids: { tabId: 1 },
        error: { message: 'boom' }
      })
    ];
    const bundle = buildBundle(events, [], SESSION);
    const md = bundle.summaryMarkdown;
    expect(md).toContain('## Session');
    expect(md).toContain('## Top Findings');
    expect(md).toContain('## Runtime Map');
    expect(md).toContain('## Errors');
    expect(md).toContain('## Slow Operations');
    expect(md).toContain('1200ms');
    expect(md).toContain('## Suggested Source Files');
  });

  it('readme explains read order', () => {
    const readme = buildReadme();
    expect(readme).toContain('summary.agent.md');
    expect(readme).toContain('diagnosis.json');
    expect(readme).toContain('runtime-map.json');
    expect(readme).toContain('events/');
    expect(readme).toContain('artifacts/');
  });

  it('runtime map links artifacts to ids', () => {
    const events = [
      mk({
        domain: 'screenshot-ref',
        event: 'ax.snapshot.end',
        ids: { toolUseId: 'tu-1', tabId: 3 }
      })
    ];
    const artifacts = [
      {
        id: 'art-1',
        type: 'ax-summary' as const,
        createdAt: '2026-06-27T12:00:01.000Z',
        ids: { toolUseId: 'tu-1', tabId: 3 },
        mimeType: 'application/json',
        byteLength: 100,
        sha256: 'sha256-abc',
        redacted: true
      }
    ];
    const bundle = buildBundle(events, artifacts, SESSION);
    expect(bundle.runtimeMap.artifacts).toHaveLength(1);
    expect(bundle.runtimeMap.artifacts[0].id).toBe('art-1');
    expect(bundle.runtimeMap.toolUses[0].id).toBe('tu-1');
  });
});

describe('exportDebugBundle via recorder', () => {
  let store: InMemoryDebugStore;

  beforeEach(() => {
    store = new InMemoryDebugStore();
  });

  afterEach(() => {
    resetDebugRecorder();
  });

  it('returns null when no session was ever started', async () => {
    const bundle = await exportDebugBundle();
    expect(bundle).toBeNull();
  });

  it('exports the active session as a bundle', async () => {
    await startDebugSession({ store, extensionVersion: '0.1.0' });
    recordEvent({
      domain: 'tool-runtime',
      event: 'tool.request.received',
      ids: { requestId: 'r-1', toolUseId: 'tu-1' },
      data: { toolName: 'computer_screenshot' }
    });
    await recordArtifact({
      type: 'screenshot',
      mimeType: 'image/png',
      ids: { toolUseId: 'tu-1' },
      content: 'png-bytes'
    });
    const bundle = await exportDebugBundle();
    expect(bundle).not.toBeNull();
    expect(bundle!.session.extensionVersion).toBe('0.1.0');
    expect(bundle!.eventsByDomain['tool-runtime'].length).toBeGreaterThan(0);
    expect(bundle!.artifacts).toHaveLength(1);
    expect(bundle!.summaryMarkdown).toContain('SuperDuck Debug Summary');
  });

  it('can export a stopped session from the store', async () => {
    await startDebugSession({ store, extensionVersion: '0.1.0' });
    recordEvent({ domain: 'cdp', event: 'cdp.command.start', ids: { tabId: 1 } });
    await stopDebugSession();
    const bundle = await exportDebugBundle();
    expect(bundle).not.toBeNull();
    expect(bundle!.session.endedAt).toBeTruthy();
    expect(bundle!.eventsByDomain.cdp.length).toBeGreaterThan(0);
  });
});

describe('serializeBundleForTransport lightweight mode', () => {
  const SESSION: DebugSessionMeta = {
    debugSessionId: 'sess-lw',
    runtimeSessionId: 'rt-lw',
    startedAt: '2026-06-30T10:00:00Z',
    extensionVersion: '0.1.0',
    eventCount: 1,
    artifactCount: 1
  };

  it('strips screenshot content when lightweight=true', () => {
    const events = [mk({ domain: 'tool-runtime', event: 'tool.request.received' })];
    const artifacts = [
      {
        id: 'ss-1',
        type: 'screenshot' as const,
        createdAt: '2026-06-30T10:00:00Z',
        ids: {},
        mimeType: 'image/png',
        byteLength: 100,
        sha256: 'abc',
        redacted: false,
        content: 'base64-screenshot-data-that-is-very-long'
      },
      {
        id: 'ax-1',
        type: 'ax-summary' as const,
        createdAt: '2026-06-30T10:00:00Z',
        ids: {},
        mimeType: 'text/plain',
        byteLength: 50,
        sha256: 'def',
        redacted: false,
        content: 'ax-tree-text-content'
      }
    ];
    const bundle = buildBundle(events, artifacts as any, SESSION);
    const json = serializeBundleForTransport(bundle, { lightweight: true });
    const parsed = JSON.parse(json);
    const ss = parsed.artifacts.find((a: any) => a.id === 'ss-1');
    const ax = parsed.artifacts.find((a: any) => a.id === 'ax-1');
    expect(ss.content).toBeUndefined();
    expect(ax.content).toBe('ax-tree-text-content');
    expect(parsed.summaryMarkdown).toContain('screenshot image content stripped');
  });

  it('keeps screenshot content when lightweight=false (under size limit)', () => {
    const events = [mk({ domain: 'tool-runtime', event: 'tool.request.received' })];
    const artifacts = [
      {
        id: 'ss-2',
        type: 'screenshot' as const,
        createdAt: '2026-06-30T10:00:00Z',
        ids: {},
        mimeType: 'image/png',
        byteLength: 10,
        sha256: 'xyz',
        redacted: false,
        content: 'small-png'
      }
    ];
    const bundle = buildBundle(events, artifacts as any, SESSION);
    const json = serializeBundleForTransport(bundle);
    const parsed = JSON.parse(json);
    const ss = parsed.artifacts.find((a: any) => a.id === 'ss-2');
    expect(ss.content).toBe('small-png');
  });

  it('returns error JSON for null bundle', () => {
    const json = serializeBundleForTransport(null, { lightweight: true });
    expect(JSON.parse(json).error).toBe('no active debug session');
  });
});
