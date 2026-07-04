import { describe, expect, it } from 'vitest';
import { resolveToolExecutionSession } from './sessionScope';

describe('resolveToolExecutionSession', () => {
  it('keeps logical sidepanel sessions out of browser lease scope', () => {
    const resolved = resolveToolExecutionSession({
      defaultSessionId: 'native',
      sessionId: 'chat-session'
    });

    expect(resolved).toEqual({
      sessionId: 'chat-session',
      browserScope: undefined
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

  it('falls back to browser session args for MCP callers', () => {
    const resolved = resolveToolExecutionSession({
      defaultSessionId: 'native',
      args: { session_id: 'mcp-session' }
    });

    expect(resolved).toEqual({
      sessionId: 'mcp-session',
      browserScope: { sessionId: 'mcp-session' }
    });
  });
});
