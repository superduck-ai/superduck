/**
 * Wraps user-supplied JavaScript code for CDP `Runtime.evaluate`.
 *
 * Strategy: compile-then-execute with a fallback for multi-statement code.
 *
 * 1. Syntax check: `new AsyncFunction(body)` validates the code as an
 *    expression (including `await` support) WITHOUT executing it. This
 *    avoids double-execution if the user code throws a SyntaxError at
 *    runtime (e.g. `throw new SyntaxError("boom")`).
 * 2. If valid expression: execute via `eval()` wrapped in an async arrow
 *    function — supports `await` and auto-returns the value.
 * 3. If SyntaxError (multi-statement like `const x = 1; x + 1`): fall
 *    back to plain `eval(code)` — supports multi-statement and auto-returns
 *    the last expression, but NOT top-level `await`.
 *
 * Newlines around user code isolate it from line comments (`// ...`).
 *
 * CDP is called with `awaitPromise: true`, so the returned Promise is
 * automatically resolved before the result is sent back.
 */
export function wrapUserCode(code: string): string {
  const codeStr = JSON.stringify(code);
  return `
    (async function() {
      'use strict';
      const __AsyncFn = Object.getPrototypeOf(async function(){}).constructor;
      try {
        try {
          new __AsyncFn('return (\\n' + ${codeStr} + '\\n)');
        } catch (e) {
          if (e instanceof SyntaxError) {
            return await eval(${codeStr});
          }
          throw e;
        }
        return await eval('(async () => {\\nreturn (\\n' + ${codeStr} + '\\n)\\n})()');
      } catch (e) {
        throw e;
      }
    })()
  `;
}
