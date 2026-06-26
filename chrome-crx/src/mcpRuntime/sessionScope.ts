export interface BrowserSessionParts {
  sessionId?: string;
  turnId?: string;
}

export interface BrowserSessionScope {
  sessionId: string;
  turnId: string;
}

type BrowserSessionSource = Record<string, unknown> & {
  sessionId?: unknown;
  session_id?: unknown;
  turnId?: unknown;
  turn_id?: unknown;
};

const SESSION_KEYS = ['session_id', 'sessionId'] as const;
const TURN_KEYS = ['turn_id', 'turnId'] as const;

export function parseOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function firstString(
  sources: (BrowserSessionSource | undefined)[],
  keys: readonly (keyof BrowserSessionSource)[]
): string | undefined {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const value = parseOptionalString(source[key]);
      if (value) return value;
    }
  }
  return undefined;
}

export function resolveBrowserSessionParts(
  ...sources: (BrowserSessionSource | undefined)[]
): BrowserSessionParts {
  return {
    sessionId: firstString(sources, SESSION_KEYS),
    turnId: firstString(sources, TURN_KEYS)
  };
}

export function resolveBrowserSessionScope(
  ...sources: (BrowserSessionSource | undefined)[]
): BrowserSessionScope | undefined {
  const parts = resolveBrowserSessionParts(...sources);
  // sessionId alone identifies a browser session; turnId is a per-turn stamp
  // that defaults to the sessionId when the caller omits it (the CLI has no
  // host runtime to manage distinct turns, so turn == session there).
  if (!parts.sessionId) return undefined;
  return { sessionId: parts.sessionId, turnId: parts.turnId ?? parts.sessionId };
}

export function resolveToolExecutionSession(options: {
  defaultSessionId: string;
  args?: BrowserSessionSource;
  sessionId?: unknown;
  turnId?: unknown;
}): { sessionId: string; turnId?: string; browserScope?: BrowserSessionScope } {
  const parts = resolveBrowserSessionParts(
    { sessionId: options.sessionId, turnId: options.turnId },
    options.args
  );
  const sessionId = parts.sessionId ?? options.defaultSessionId;
  const browserScope: BrowserSessionScope | undefined = parts.sessionId
    ? { sessionId: parts.sessionId, turnId: parts.turnId ?? parts.sessionId }
    : undefined;
  return {
    sessionId,
    turnId: parts.turnId,
    browserScope
  };
}
