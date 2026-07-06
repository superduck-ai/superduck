import { describe, expect, it } from 'vitest';

import { getStatusKind, getStatusView, isNativeHostReady } from './nativeHostStatusView';

const intl = {
  formatMessage: ({ defaultMessage, id }: { id: string; defaultMessage?: string }) =>
    defaultMessage ?? id
};

describe('native host status view', () => {
  it('treats an installed native host as connected even when no CLI client is attached', () => {
    const status = {
      nativeHostInstalled: true,
      mcpConnected: false
    };

    expect(isNativeHostReady(status)).toBe(true);
    expect(getStatusKind(status, false, false, false)).toBe('connected');
    expect(getStatusView(intl, 'connected')).toMatchObject({
      label: 'Connected',
      dotClassName: 'bg-success-100',
      iconClassName: 'bg-success-900/40 text-success-100',
      pillClassName: 'bg-success-900/40 text-success-100'
    });
  });

  it('keeps transient connection states above the ready state', () => {
    expect(
      isNativeHostReady({
        nativeHostInstalled: true,
        mcpConnected: false,
        connecting: true
      })
    ).toBe(false);
    expect(
      isNativeHostReady({
        nativeHostInstalled: true,
        mcpConnected: false,
        reconnecting: true
      })
    ).toBe(false);
    expect(
      getStatusKind(
        {
          nativeHostInstalled: true,
          mcpConnected: false,
          reconnecting: true
        },
        false,
        false,
        false
      )
    ).toBe('waiting');
  });

  it('reports bridge-only MCP connectivity separately from native host readiness', () => {
    expect(
      getStatusKind(
        {
          nativeHostInstalled: false,
          mcpConnected: true
        },
        false,
        false,
        false
      )
    ).toBe('bridge');
  });

  it('reports disconnected only when neither native host nor bridge is connected', () => {
    expect(
      getStatusKind(
        {
          nativeHostInstalled: false,
          mcpConnected: false
        },
        false,
        false,
        false
      )
    ).toBe('disconnected');
  });
});
