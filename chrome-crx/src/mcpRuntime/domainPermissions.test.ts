import { describe, it, expect, vi } from 'vitest';

const chromeMock = vi.hoisted(() => {
  const listener = { addListener: vi.fn() };
  return {
    tabs: {
      onRemoved: listener,
      onActivated: listener,
      onUpdated: listener,
      get: vi.fn()
    },
    runtime: { getURL: vi.fn((p: string) => p), onMessage: listener, onStartup: listener },
    debugger: { onEvent: listener, onDetach: listener },
    webNavigation: {
      onBeforeNavigate: listener,
      onCommitted: listener,
      onHistoryStateUpdated: listener
    },
    storage: { onChanged: listener, local: { get: vi.fn(), set: vi.fn() } }
  };
});

vi.stubGlobal('chrome', chromeMock);

const { checkUrlSecurity } = await import('./domainPermissions');

describe('checkUrlSecurity', () => {
  it.each(['chrome:', 'chrome-extension:', 'about:', 'data:', 'javascript:'])(
    'blocks %s URLs',
    async (proto) => {
      const result = await checkUrlSecurity(1, `${proto}//foo`, 'navigate');
      expect(result).toEqual({ error: `Cannot perform navigate on ${proto} URLs` });
    }
  );

  it('returns null for safe http/https URLs', async () => {
    expect(await checkUrlSecurity(1, 'https://example.com', 'navigate')).toBeNull();
    expect(await checkUrlSecurity(1, 'http://example.com', 'navigate')).toBeNull();
  });
});
