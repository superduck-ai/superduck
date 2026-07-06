export interface BrowserSessionScope {
  sessionId: string;
}

type BrowserSessionSource = Record<string, unknown> & {
  sessionId?: unknown;
  session_id?: unknown;
};

const SESSION_KEYS = ['session_id', 'sessionId'] as const;
export const DEFAULT_BROWSER_SESSION_ID = '__default__';

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function resolveBrowserSessionId(
  ...sources: (BrowserSessionSource | undefined)[]
): string | undefined {
  for (const source of sources) {
    if (!source) continue;
    for (const key of SESSION_KEYS) {
      const value = parseOptionalString(source[key]);
      if (value) return value;
    }
  }
  return undefined;
}

export function resolveBrowserSessionScope(
  ...sources: (BrowserSessionSource | undefined)[]
): BrowserSessionScope | undefined {
  const sessionId = resolveBrowserSessionId(...sources);
  return sessionId ? { sessionId } : undefined;
}

export function hasReservedBrowserSessionArgs(
  source: Record<string, unknown> | undefined
): boolean {
  if (!source) return false;
  return SESSION_KEYS.some((key) => source[key] !== undefined);
}

export function reservedBrowserSessionArgsError(): string {
  return 'session_id/sessionId must be passed in the tool request envelope, not inside tool args';
}

// `sessionId` is the logical tool-execution/session trace id. `browserSessionId`
// is the tab-lease ownership credential. Both are accepted only from the
// transport envelope; model-controlled tool args are rejected before this point.
export function resolveToolExecutionSession(options: {
  defaultSessionId: string;
  sessionId?: unknown;
  browserSessionId?: unknown;
}): { sessionId: string; browserScope: BrowserSessionScope } {
  const logicalSessionId = resolveBrowserSessionId({ sessionId: options.sessionId });
  const browserSessionId = resolveBrowserSessionId({ sessionId: options.browserSessionId });
  return {
    sessionId: logicalSessionId ?? browserSessionId ?? options.defaultSessionId,
    browserScope: { sessionId: browserSessionId ?? DEFAULT_BROWSER_SESSION_ID }
  };
}
