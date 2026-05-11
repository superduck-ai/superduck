/**
 * Structured logger for the Chrome extension.
 *
 * Emits JSON-serialisable log records with consistent metadata (timestamp,
 * level, component, fields) so logs can be tailed in DevTools and shipped to
 * downstream observability sinks (Sentry breadcrumbs, OpenTelemetry log
 * processors, custom reporters). The logger is intentionally dependency-free
 * so it works in service worker, content-script, side-panel and offscreen
 * contexts without any bundler shimming.
 *
 * Design notes:
 * - Level filtering is dynamic (configurable at runtime via setLevel).
 * - Each call produces ONE line, so DevTools' filter input works as expected.
 * - Optional reporters fan out records to e.g. Sentry, telemetry, storage.
 * - PII-sensitive fields can be redacted via setRedactKeys.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  ts: string;
  level: LogLevel;
  component: string;
  msg: string;
  fields?: Record<string, unknown>;
}

export type LogReporter = (record: LogRecord) => void;

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const DEFAULT_REDACT_KEYS: ReadonlyArray<string> = [
  'apiKey',
  'api_key',
  'authorization',
  'cookie',
  'password',
  'secret',
  'token'
];

let currentLevel: LogLevel = 'info';
const reporters: LogReporter[] = [];
let redactKeys: Set<string> = new Set(DEFAULT_REDACT_KEYS.map((k) => k.toLowerCase()));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function setLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLevel(): LogLevel {
  return currentLevel;
}

export function addReporter(reporter: LogReporter): () => void {
  reporters.push(reporter);
  return () => {
    const idx = reporters.indexOf(reporter);
    if (idx >= 0) reporters.splice(idx, 1);
  };
}

export function setRedactKeys(keys: Iterable<string>): void {
  redactKeys = new Set([...keys].map((k) => k.toLowerCase()));
}

export function clearReporters(): void {
  reporters.length = 0;
}

function shouldEmit(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[currentLevel];
}

function redact(value: Record<string, unknown>, depth?: number): Record<string, unknown>;
function redact(value: unknown, depth?: number): unknown;
function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (redactKeys.has(k.toLowerCase())) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

function emit(
  level: LogLevel,
  component: string,
  msg: string,
  fields?: Record<string, unknown>
): void {
  if (!shouldEmit(level)) return;

  const record: LogRecord = {
    ts: new Date().toISOString(),
    level,
    component,
    msg
  };
  if (fields && Object.keys(fields).length > 0) {
    record.fields = redact(fields);
  }

  let line: string;
  try {
    line = JSON.stringify(record);
  } catch {
    line = JSON.stringify({
      ts: record.ts,
      level: record.level,
      component: record.component,
      msg: record.msg,
      error: 'unserializable fields'
    });
  }
  switch (level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'debug':
      console.debug(line);
      break;
    default:
      console.info(line);
  }

  for (const reporter of reporters) {
    try {
      reporter(record);
    } catch {
      // A misbehaving reporter must never break the log call site.
    }
  }
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(extra: Record<string, unknown>): Logger;
}

export function createLogger(component: string, base: Record<string, unknown> = {}): Logger {
  const merge = (fields?: Record<string, unknown>): Record<string, unknown> | undefined => {
    if (!fields && Object.keys(base).length === 0) return undefined;
    return { ...base, ...(fields ?? {}) };
  };

  return {
    debug: (msg, fields) => emit('debug', component, msg, merge(fields)),
    info: (msg, fields) => emit('info', component, msg, merge(fields)),
    warn: (msg, fields) => emit('warn', component, msg, merge(fields)),
    error: (msg, fields) => emit('error', component, msg, merge(fields)),
    child: (extra) => createLogger(component, { ...base, ...extra })
  };
}

// Convenience root logger for callers that don't need a per-module child.
export const logger = createLogger('app');
