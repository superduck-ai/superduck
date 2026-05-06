import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createLogger,
  setLevel,
  addReporter,
  clearReporters,
  setRedactKeys,
  type LogRecord
} from './logger';

describe('logger', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setLevel('debug');
    clearReporters();
    setRedactKeys(['apiKey', 'token']);
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits structured JSON with component and fields', () => {
    const log = createLogger('sidepanel');
    log.info('navigated', { url: 'https://example.com' });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('info');
    expect(parsed.component).toBe('sidepanel');
    expect(parsed.msg).toBe('navigated');
    expect(parsed.fields).toEqual({ url: 'https://example.com' });
    expect(typeof parsed.ts).toBe('string');
  });

  it('respects level filtering', () => {
    setLevel('warn');
    const log = createLogger('x');
    log.debug('skip me');
    log.info('skip me too');
    log.warn('keep');
    log.error('keep');
    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('redacts configured field names recursively', () => {
    const log = createLogger('auth');
    log.info('login', {
      user: 'alice',
      apiKey: 'secret-value',
      nested: { token: 'jwt' }
    });
    const parsed = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(parsed.fields.apiKey).toBe('[REDACTED]');
    expect(parsed.fields.nested.token).toBe('[REDACTED]');
    expect(parsed.fields.user).toBe('alice');
  });

  it('child logger merges base fields', () => {
    const log = createLogger('runtime').child({ tabId: 42 });
    log.info('opened');
    const parsed = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(parsed.fields).toEqual({ tabId: 42 });
  });

  it('fans out records to registered reporters', () => {
    const seen: LogRecord[] = [];
    addReporter((r) => seen.push(r));
    const log = createLogger('mcp');
    log.error('boom', { code: 500 });
    expect(seen).toHaveLength(1);
    expect(seen[0].level).toBe('error');
    expect(seen[0].fields).toEqual({ code: 500 });
  });

  it('isolates reporter exceptions from the call site', () => {
    addReporter(() => {
      throw new Error('reporter blew up');
    });
    const log = createLogger('safe');
    expect(() => log.info('still works')).not.toThrow();
  });

  it('redacts keys case-insensitively', () => {
    setRedactKeys(['apikey', 'token']);
    const log = createLogger('auth');
    log.info('req', { Authorization: 'Bearer xxx', ApiKey: 'secret', user: 'bob' });
    const parsed = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(parsed.fields.ApiKey).toBe('[REDACTED]');
    expect(parsed.fields.user).toBe('bob');
  });

  it('handles circular references without throwing', () => {
    const log = createLogger('circ');
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(() => log.info('circular', obj)).not.toThrow();
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(parsed.error).toBe('unserializable fields');
  });

  it('handles bigint without throwing', () => {
    const log = createLogger('big');
    expect(() => log.info('big', { n: BigInt(42) })).not.toThrow();
    expect(infoSpy).toHaveBeenCalledTimes(1);
  });
});
