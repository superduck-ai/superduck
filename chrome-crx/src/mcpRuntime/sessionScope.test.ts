import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BROWSER_SESSION_ID,
  hasReservedBrowserSessionArgs,
  reservedBrowserSessionArgsError,
  resolveToolExecutionSession
} from './sessionScope';

describe('resolveToolExecutionSession', () => {
  it('keeps logical sidepanel sessions out of browser lease scope', () => {
    const resolved = resolveToolExecutionSession({
      defaultSessionId: 'native',
      sessionId: 'chat-session'
    });

    expect(resolved).toEqual({
      sessionId: 'chat-session',
      browserScope: { sessionId: DEFAULT_BROWSER_SESSION_ID }
    });
  });

  it('uses browserSessionId for tab lease scope', () => {
    const resolved = resolveToolExecutionSession({
      defaultSessionId: 'native',
      sessionId: 'chat-session',
      browserSessionId: 'cli-session'
    });

    expect(resolved).toEqual({
      sessionId: 'chat-session',
      browserScope: { sessionId: 'cli-session' }
    });
  });

  it('defaults browser lease scope when no envelope browser session exists', () => {
    const resolved = resolveToolExecutionSession({
      defaultSessionId: 'native'
    });

    expect(resolved).toEqual({
      sessionId: 'native',
      browserScope: { sessionId: DEFAULT_BROWSER_SESSION_ID }
    });
  });

  it('detects reserved browser session args for the transport boundary', () => {
    expect(hasReservedBrowserSessionArgs({ session_id: 'mcp-session' })).toBe(true);
    expect(hasReservedBrowserSessionArgs({ sessionId: 'mcp-session' })).toBe(true);
    expect(hasReservedBrowserSessionArgs({ tabId: 1 })).toBe(false);
    expect(reservedBrowserSessionArgsError()).toContain('tool request envelope');
  });
});
