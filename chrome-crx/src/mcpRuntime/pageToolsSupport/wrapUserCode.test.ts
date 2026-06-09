import { describe, it, expect } from 'vitest';
import { wrapUserCode } from './wrapUserCode';

/**
 * wrapUserCode produces a string that will be sent to CDP Runtime.evaluate.
 * We eval the wrapper in Node to verify:
 *   1. The wrapper is syntactically valid JS
 *   2. User code containing `await` does NOT cause a SyntaxError
 *   3. The wrapper returns a Promise (CDP's awaitPromise: true expects this)
 *   4. Single expressions auto-return their value
 *   5. Multi-statement code executes and auto-returns the last expression
 *   6. Line comments in user code don't break the wrapper
 */

describe('wrapUserCode', () => {
  it('returns a Promise when evaluated', () => {
    const wrapped = wrapUserCode('1 + 1');
    const result = eval(wrapped);
    expect(result).toBeInstanceOf(Promise);
  });

  it('resolves to the correct value for simple expressions', async () => {
    const wrapped = wrapUserCode('2 + 3');
    const result = await eval(wrapped);
    expect(result).toBe(5);
  });

  it('supports top-level await in user code', async () => {
    const wrapped = wrapUserCode('await Promise.resolve(42)');
    const result = await eval(wrapped);
    expect(result).toBe(42);
  });

  it('supports await with object expressions', async () => {
    const wrapped = wrapUserCode("await Promise.resolve({ hashing: 'md5', featureCount: 3 })");
    const result = await eval(wrapped);
    expect(result).toEqual({ hashing: 'md5', featureCount: 3 });
  });

  it('supports await with chained then calls (real-world pattern)', async () => {
    const wrapped = wrapUserCode('await Promise.resolve(\'{"ok":true}\').then(JSON.parse)');
    const result = await eval(wrapped);
    expect(result).toEqual({ ok: true });
  });

  it('propagates errors from user code', async () => {
    const wrapped = wrapUserCode('(() => { throw new Error("user error") })()');
    await expect(eval(wrapped)).rejects.toThrow('user error');
  });

  it('propagates errors from awaited promises', async () => {
    const wrapped = wrapUserCode('await Promise.reject(new Error("async fail"))');
    await expect(eval(wrapped)).rejects.toThrow('async fail');
  });

  it('handles code without await (backward compatibility)', async () => {
    const wrapped = wrapUserCode('"hello"');
    const result = eval(wrapped);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe('hello');
  });

  it('handles fetch-like patterns that return promises', async () => {
    const wrapped = wrapUserCode('Promise.resolve({ status: 200 })');
    const result = await eval(wrapped);
    expect(result).toEqual({ status: 200 });
  });

  it('handles arrow function expressions', async () => {
    const wrapped = wrapUserCode('(() => 42)()');
    const result = await eval(wrapped);
    expect(result).toBe(42);
  });

  it('handles trailing semicolons via statement fallback', async () => {
    const wrapped = wrapUserCode('42;');
    const result = await eval(wrapped);
    // Trailing semicolon causes `return (42;)` to be a SyntaxError,
    // so it falls back to plain eval which still returns 42.
    expect(result).toBe(42);
  });

  // Multi-statement code: fallback to plain eval, auto-returns last expression
  it('supports multi-statement code with auto-return via fallback', async () => {
    const wrapped = wrapUserCode('const x = 1; const y = 2; x + y');
    const result = await eval(wrapped);
    // Plain eval returns the last expression value
    expect(result).toBe(3);
  });

  it('multi-statement code with side effects returns last expression', async () => {
    const wrapped = wrapUserCode('const arr = []; arr.push(1); arr.push(2); arr.length');
    const result = await eval(wrapped);
    expect(result).toBe(2);
  });

  // Line comments: newlines around user code prevent comment from eating wrapper
  it('handles code ending with a line comment', async () => {
    const wrapped = wrapUserCode('42 // the answer');
    const result = await eval(wrapped);
    expect(result).toBe(42);
  });

  it('handles await code ending with a line comment', async () => {
    const wrapped = wrapUserCode('await Promise.resolve(42) // async result');
    const result = await eval(wrapped);
    expect(result).toBe(42);
  });

  it('handles await with then chains from the bug report', async () => {
    const wrapped = wrapUserCode(
      'await Promise.resolve(\'{"features":{"1578936685":true}}\').then(JSON.parse).then(j => ({ has1578936685: Boolean(j.features && j.features[\'1578936685\']), featureCount: Object.keys(j.features).length }))'
    );
    const result = await eval(wrapped);
    expect(result).toEqual({ has1578936685: true, featureCount: 1 });
  });

  // No double execution: code that throws SyntaxError at runtime must not
  // be re-executed by the fallback path
  it('does not double-execute when user code throws SyntaxError at runtime', async () => {
    const wrapped = wrapUserCode(
      '(() => { globalThis.__execCount = (globalThis.__execCount || 0) + 1; throw new SyntaxError("boom"); })()'
    );
    (globalThis as any).__execCount = 0;
    await expect(eval(wrapped)).rejects.toThrow('boom');
    expect((globalThis as any).__execCount).toBe(1);
    delete (globalThis as any).__execCount;
  });
});
