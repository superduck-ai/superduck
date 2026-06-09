/**
 * Wraps user-supplied JavaScript code in an async IIFE so that top-level
 * `await` works when the string is passed to CDP `Runtime.evaluate`.
 *
 * The code is embedded directly in the async function body (no eval),
 * because eval() parses code as a standalone script where `await` is
 * always a SyntaxError — even when called from an async function.
 *
 * CDP is called with `awaitPromise: true`, so the returned Promise is
 * automatically resolved before the result is sent back.
 *
 * Note: the tool description tells users to write a single expression.
 * Multi-statement code with declarations (const/let/var) won't work
 * because it would be placed after `return await`.
 */
export function wrapUserCode(code: string): string {
  return `
    (async function() {
      'use strict';
      try {
        return await ${code};
      } catch (e) {
        throw e;
      }
    })()
  `;
}
