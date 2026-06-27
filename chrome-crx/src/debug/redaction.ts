/**
 * Redaction for debug payloads.
 *
 * All debug writes must pass through here before hitting the ring buffer /
 * artifact store. The goal is never to persist sensitive full text — auth
 * tokens, cookies, full page text, full JS code, unredacted URL query — while
 * keeping enough structure for diagnosis.
 */

import type { DebugArtifactType } from './schema';

const DEFAULT_REDACT_KEYS: ReadonlySet<string> = new Set([
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'password',
  'secret',
  'token',
  'credential',
  'session'
]);

const URL_FIELD_NAMES = new Set(['url', 'href', 'src', 'origin', 'redirecturi', 'redirect_uri']);

export const REDACTED = '[REDACTED]';
export const DEFAULT_MAX_TEXT_FIELD_BYTES = 50 * 1024;
export const DEFAULT_MAX_DEPTH = 8;
const CODE_PREVIEW_CHARS = 200;

export interface RedactionOptions {
  redactKeys?: ReadonlySet<string>;
  maxTextFieldBytes?: number;
  maxDepth?: number;
  includeSensitivePayloads?: boolean;
  redactUrlFields?: boolean;
  keepUrlQuery?: boolean;
}

export function defaultRedactKeys(): ReadonlySet<string> {
  return DEFAULT_REDACT_KEYS;
}

export function truncateText(s: string, opts: RedactionOptions = {}): string {
  const max = opts.maxTextFieldBytes ?? DEFAULT_MAX_TEXT_FIELD_BYTES;
  if (s.length <= max) return s;
  return s.slice(0, max) + `…[truncated ${s.length - max} chars]`;
}

/**
 * Redact a URL to origin + path. Query string is replaced with a placeholder
 * unless `keepUrlQuery` is set. Non-URL strings are returned truncated.
 */
export function redactUrl(url: string, opts: { keepQuery?: boolean } = {}): string {
  try {
    const u = new URL(url);
    if (opts.keepQuery) return `${u.origin}${u.pathname}${u.search}`;
    if (u.search) return `${u.origin}${u.pathname}?[redacted-query]`;
    if (u.hash) return `${u.origin}${u.pathname}#[redacted-hash]`;
    return `${u.origin}${u.pathname}`;
  } catch {
    return truncateText(url);
  }
}

/**
 * Synchronous, non-cryptographic hash for code fingerprinting. SubtleCrypto
 * SHA-256 is async and cannot run inside the synchronous recordEvent path;
 * this hash is only a dedup/fingerprint signal, not a security primitive.
 * Artifact content (where we can await) uses sha256Hex() instead.
 */
export function hashString(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `fnv1a-${hex(h1)}${hex(h2)}`;
}

/** Async SHA-256 hex digest for artifact content. Falls back to FNV if crypto is unavailable. */
export async function sha256Hex(input: string | ArrayBuffer | Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const bytes =
        typeof input === 'string' ? new TextEncoder().encode(input) : toUint8Array(input);
      const digest = await subtle.digest('SHA-256', bytes as unknown as BufferSource);
      return `sha256-${hexFromBytes(new Uint8Array(digest))}`;
    } catch {
      // fall through to FNV
    }
  }
  const s = typeof input === 'string' ? input : decodeBytes(toUint8Array(input));
  return hashString(s);
}

function hexFromBytes(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

function decodeBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder().decode(bytes);
  } catch {
    return `<${bytes.byteLength} bytes>`;
  }
}

function toUint8Array(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

export interface CodeRedactionResult {
  hash: string;
  preview: string;
  length: number;
  fullCode?: string;
}

export function redactCode(code: string, opts: RedactionOptions = {}): CodeRedactionResult {
  const hash = hashString(code);
  const preview = code.slice(0, CODE_PREVIEW_CHARS);
  const result: CodeRedactionResult = { hash, preview, length: code.length };
  if (opts.includeSensitivePayloads) result.fullCode = code;
  return result;
}

export function redactValue(value: unknown, opts: RedactionOptions = {}): unknown {
  const redactKeys = opts.redactKeys ?? DEFAULT_REDACT_KEYS;
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  return redactRecursive(value, redactKeys, opts, 0, maxDepth, new WeakSet());
}

function redactRecursive(
  value: unknown,
  redactKeys: ReadonlySet<string>,
  opts: RedactionOptions,
  depth: number,
  maxDepth: number,
  seen: WeakSet<object>
): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return truncateText(value, opts);
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return `[BigInt:${value.toString()}]`;
  if (typeof value === 'symbol') return `[Symbol:${String(value)}]`;
  if (typeof value === 'function')
    return `[Function:${(value as { name?: string }).name || 'anonymous'}]`;
  if (typeof value !== 'object') return String(value);

  if (depth > maxDepth) return '[maxDepth]';
  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);
  try {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: truncateText(value.message, opts),
        stack: value.stack ? truncateText(value.stack, opts) : undefined
      };
    }
    if (value instanceof Date) return value.toISOString();
    if (value instanceof RegExp) return value.toString();
    if (value instanceof Map) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of value.entries()) {
        const key = typeof k === 'string' ? k : String(k);
        out[key] = redactKeyOrValue(key, v, redactKeys, opts, depth, maxDepth, seen);
      }
      return out;
    }
    if (value instanceof Set) {
      return [...value].map((v) => redactRecursive(v, redactKeys, opts, depth + 1, maxDepth, seen));
    }
    if (Array.isArray(value)) {
      return value.map((v) => redactRecursive(v, redactKeys, opts, depth + 1, maxDepth, seen));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactKeyOrValue(k, v, redactKeys, opts, depth, maxDepth, seen);
    }
    return out;
  } finally {
    seen.delete(value as object);
  }
}

function redactKeyOrValue(
  key: string,
  value: unknown,
  redactKeys: ReadonlySet<string>,
  opts: RedactionOptions,
  depth: number,
  maxDepth: number,
  seen: WeakSet<object>
): unknown {
  if (redactKeys.has(key.toLowerCase())) return REDACTED;
  if (
    opts.redactUrlFields !== false &&
    typeof value === 'string' &&
    URL_FIELD_NAMES.has(key.toLowerCase())
  ) {
    return redactUrl(value, { keepQuery: opts.keepUrlQuery === true });
  }
  return redactRecursive(value, redactKeys, opts, depth + 1, maxDepth, seen);
}

export interface ArtifactRedactionResult {
  data: unknown;
  redacted: boolean;
}

export function redactArtifactData(
  data: unknown,
  _type: DebugArtifactType,
  opts: RedactionOptions = {}
): ArtifactRedactionResult {
  return { data: redactValue(data, opts), redacted: true };
}
