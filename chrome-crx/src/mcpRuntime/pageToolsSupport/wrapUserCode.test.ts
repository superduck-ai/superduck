import { describe, it, expect } from 'vitest';
import { wrapUserCode } from './wrapUserCode';

/**
 * wrapUserCode produces a string that will be sent to CDP Runtime.evaluate.
 * We eval the wrapper in Node to verify:
 *   1. The wrapper is syntactically valid JS
 *   2. User code containing `await` does NOT cause a SyntaxError (the original bug)
 *   3. The wrapper returns a Promise (CDP's awaitPromise: true expects this)
 *   4. The resolved value matches the user expression's result
 */

describe('wrapUserCode', () => {
  it('wraps code in an async IIFE', () => {
    const wrapped = wrapUserCode('1 + 1');
    expect(wrapped).toContain('async function');
    expect(wrapped).toContain('return await');
  });

  it('does not use eval (eval cannot handle top-level await)', () => {
    const wrapped = wrapUserCode('1 + 1');
    expect(wrapped).not.toContain('eval(');
  });

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

  it('supports top-level await in user code (the bug fix)', async () => {
    // This is the exact scenario from the bug report: user writes `await fetch(...)`
    // Before the fix, the wrapper used eval() inside a sync IIFE, so `await`
    // caused a SyntaxError both from the sync IIFE and from eval itself.
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

  it('handles trailing semicolons in user code', async () => {
    const wrapped = wrapUserCode('42;');
    const result = await eval(wrapped);
    expect(result).toBe(42);
  });
});
