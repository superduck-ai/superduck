/**
 * Wraps user-supplied JavaScript code for CDP `Runtime.evaluate`.
 *
 * Uses a two-tier eval strategy:
 * 1. First attempt: wrap code as `return (code)` inside an async arrow function
 *    — supports single expressions (with or without `await`) and auto-returns
 *      the last expression value.
 * 2. Fallback: if the first attempt throws SyntaxError (multi-statement code
 *    like `const x = 1; x + 1`), run the code as statements inside an async
 *    arrow function. Auto-return is lost, but the code executes.
 *
 * Why eval instead of direct embedding?
 * - eval() with JSON.stringify safely escapes the user code string.
 * - Wrapping the eval'd string in `(async () => { ... })()` makes `await`
 *   syntactically valid (it's inside an async function body).
 * - Direct embedding (no eval) would break on code containing template
 *   literals, `})()` patterns, etc.
 *
 * CDP is called with `awaitPromise: true`, so the returned Promise is
 * automatically resolved before the result is sent back.
 */
export function wrapUserCode(code: string): string {
  const codeStr = JSON.stringify(code);
  return `
    (async function() {
      'use strict';
      try {
        try {
          return await eval('(async () => { return (' + ${codeStr} + ') })()');
        } catch (e) {
          if (e instanceof SyntaxError) {
            return await eval('(async () => { ' + ${codeStr} + ' })()');
          }
          throw e;
        }
      } catch (e) {
        throw e;
      }
    })()
  `;
}
