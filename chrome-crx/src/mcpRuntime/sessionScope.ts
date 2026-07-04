export interface BrowserSessionScope {
  sessionId: string;
}

type BrowserSessionSource = Record<string, unknown> & {
  sessionId?: unknown;
  session_id?: unknown;
};

const SESSION_KEYS = ['session_id', 'sessionId'] as const;

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

export function resolveToolExecutionSession(options: {
  defaultSessionId: string;
  args?: BrowserSessionSource;
  sessionId?: unknown;
  browserSessionId?: unknown;
}): { sessionId: string; browserScope?: BrowserSessionScope } {
  const logicalSessionId = resolveBrowserSessionId({ sessionId: options.sessionId });
  const browserSessionId = resolveBrowserSessionId(
    { sessionId: options.browserSessionId },
    options.args
  );
  return {
    sessionId: logicalSessionId ?? browserSessionId ?? options.defaultSessionId,
    browserScope: browserSessionId ? { sessionId: browserSessionId } : undefined
  };
}
