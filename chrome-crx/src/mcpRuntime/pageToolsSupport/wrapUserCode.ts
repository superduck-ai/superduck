/**
 * Wraps user-supplied JavaScript code for CDP `Runtime.evaluate`.
 *
 * Uses a two-tier eval strategy:
 * 1. First attempt: wrap code as `return (\ncode\n)` inside an async arrow
 *    function — supports single expressions (with or without `await`) and
 *    auto-returns the last expression value. Newlines around the code
 *    isolate it from line comments (`// ...`) that would otherwise eat
 *    the closing wrapper syntax.
 * 2. Fallback: if the first attempt throws SyntaxError (multi-statement code
 *    like `const x = 1; x + 1`), fall back to plain `eval(code)` which
 *    supports multi-statement code and auto-returns the last expression
 *    value, but does NOT support top-level `await`.
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
          return await eval('(async () => {\\nreturn (\\n' + ${codeStr} + '\\n)\\n})()');
        } catch (e) {
          if (e instanceof SyntaxError) {
            return await eval(${codeStr});
          }
          throw e;
        }
      } catch (e) {
        throw e;
      }
    })()
  `;
}
