import { describe, it, expect } from 'vitest';
import {
  redactValue,
  redactUrl,
  redactCode,
  hashString,
  truncateText,
  REDACTED,
  defaultRedactKeys
} from './redaction';

describe('redactValue', () => {
  it('redacts configured keys case-insensitively at any depth', () => {
    const out = redactValue({
      user: 'alice',
      apiKey: 'sk-xxx',
      nested: { Token: 'jwt', child: { authorization: 'Bearer y' } }
    });
    expect(out).toEqual({
      user: 'alice',
      apiKey: REDACTED,
      nested: { Token: REDACTED, child: { authorization: REDACTED } }
    });
  });

  it('redacts api_key (snake_case) and session', () => {
    const out = redactValue({ api_key: 'k', session: 's', credential: 'c', cookie: 'ck' });
    expect(out).toEqual({
      api_key: REDACTED,
      session: REDACTED,
      credential: REDACTED,
      cookie: REDACTED
    });
  });

  it('handles circular references without throwing', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const out = redactValue(obj) as Record<string, unknown>;
    expect(out.a).toBe(1);
    expect(out.self).toBe('[Circular]');
  });

  it('handles bigint, symbol, function, undefined', () => {
    const out = redactValue({
      big: BigInt(42),
      sym: Symbol('x'),
      fn: function named() {
        return 1;
      },
      u: undefined,
      n: null
    }) as Record<string, unknown>;
    expect(out.big).toBe('[BigInt:42]');
    expect(out.sym).toBe('[Symbol:Symbol(x)]');
    expect(out.fn).toBe('[Function:named]');
    expect(out.u).toBeUndefined();
    expect(out.n).toBeNull();
  });

  it('respects maxDepth', () => {
    const out = redactValue({ a: { b: { c: { d: 1 } } } }, { maxDepth: 2 }) as Record<
      string,
      unknown
    >;
    // depth 0: root, depth 1: a, depth 2: b → c becomes [maxDepth]
    expect((out as any).a.b.c).toBe('[maxDepth]');
  });

  it('truncates long strings', () => {
    const long = 'x'.repeat(100);
    const out = redactValue({ s: long }, { maxTextFieldBytes: 10 }) as Record<string, unknown>;
    expect((out.s as string).startsWith('xxxxxxxxxx')).toBe(true);
    expect(out.s as string).toContain('[truncated');
  });

  it('redacts URL fields by default, keeping origin + path, redacting query', () => {
    const out = redactValue({
      url: 'https://example.com/path?token=secret&foo=bar',
      href: 'https://other.test/x',
      src: 'https://cdn.test/img.png?q=1'
    }) as Record<string, unknown>;
    expect(out.url).toBe('https://example.com/path?[redacted-query]');
    expect(out.href).toBe('https://other.test/x');
    expect(out.src).toBe('https://cdn.test/img.png?[redacted-query]');
  });

  it('can keep URL query when asked', () => {
    const out = redactValue(
      { url: 'https://example.com/path?foo=bar' },
      { keepUrlQuery: true }
    ) as Record<string, unknown>;
    expect(out.url).toBe('https://example.com/path?foo=bar');
  });

  it('can disable URL field redaction', () => {
    const out = redactValue(
      { url: 'https://example.com/path?foo=bar' },
      { redactUrlFields: false }
    ) as Record<string, unknown>;
    expect(out.url).toBe('https://example.com/path?foo=bar');
  });

  it('preserves arrays and maps', () => {
    const m = new Map([
      ['token', 'x'],
      ['name', 'bob']
    ]);
    const out = redactValue({ arr: [1, 'two', { secret: 's' }], map: m }) as Record<
      string,
      unknown
    >;
    expect(out.arr).toEqual([1, 'two', { secret: REDACTED }]);
    expect(out.map).toEqual({ token: REDACTED, name: 'bob' });
  });

  it('serializes Error to name/message/stack', () => {
    const err = new Error('boom');
    const out = redactValue({ err }) as Record<string, unknown>;
    const e = out.err as Record<string, unknown>;
    expect(e.name).toBe('Error');
    expect(e.message).toBe('boom');
    expect(typeof e.stack).toBe('string');
  });
});

describe('redactUrl', () => {
  it('keeps origin + path, redacts query', () => {
    expect(redactUrl('https://example.com/a/b?x=1#frag')).toBe(
      'https://example.com/a/b?[redacted-query]'
    );
  });

  it('redacts hash when no query', () => {
    expect(redactUrl('https://example.com/a#secret')).toBe('https://example.com/a#[redacted-hash]');
  });

  it('returns plain origin+path for clean url', () => {
    expect(redactUrl('https://example.com/a/b')).toBe('https://example.com/a/b');
  });

  it('can keep query', () => {
    expect(redactUrl('https://example.com/a?x=1', { keepQuery: true })).toBe(
      'https://example.com/a?x=1'
    );
  });

  it('truncates non-url strings', () => {
    expect(redactUrl('not a url')).toBe('not a url');
  });
});

describe('redactCode', () => {
  it('returns hash + preview without full code by default', () => {
    const code = 'const x = 42;\nconsole.log(x);\n'.repeat(20);
    const r = redactCode(code);
    expect(r.hash).toMatch(/^fnv1a-/);
    expect(r.length).toBe(code.length);
    expect(r.preview.length).toBeLessThanOrEqual(200);
    expect(r.fullCode).toBeUndefined();
  });

  it('includes full code only when includeSensitivePayloads', () => {
    const code = 'doStuff()';
    const r = redactCode(code, { includeSensitivePayloads: true });
    expect(r.fullCode).toBe(code);
    expect(r.preview).toBe(code);
  });

  it('hash is stable for same input', () => {
    expect(redactCode('abc').hash).toBe(redactCode('abc').hash);
    expect(redactCode('abc').hash).not.toBe(redactCode('abd').hash);
  });
});

describe('hashString', () => {
  it('produces a fnv1a- prefixed hex', () => {
    expect(hashString('hello')).toMatch(/^fnv1a-[0-9a-f]{16}$/);
  });
});

describe('truncateText', () => {
  it('keeps short strings as-is', () => {
    expect(truncateText('short')).toBe('short');
  });
  it('truncates long strings with marker', () => {
    const s = 'x'.repeat(100);
    const out = truncateText(s, { maxTextFieldBytes: 10 });
    expect(out.length).toBeLessThan(s.length);
    expect(out).toContain('[truncated');
  });
});

describe('defaultRedactKeys', () => {
  it('includes the documented sensitive keys', () => {
    const keys = defaultRedactKeys();
    for (const k of [
      'apikey',
      'api_key',
      'authorization',
      'cookie',
      'password',
      'secret',
      'token',
      'credential',
      'session'
    ]) {
      expect(keys.has(k)).toBe(true);
    }
  });
});
