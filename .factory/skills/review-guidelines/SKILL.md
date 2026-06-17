# SuperDuck PR review guidelines

These guidelines are auto-loaded by the `Factory-AI/droid-action` workflow
(`.github/workflows/droid.yml`) and injected into every requested code review
and security review prompt. Edit this file to tune what the automated
reviewer focuses on.

## Repository layout reminders

- `chrome-crx/` — Chrome MV3 extension (TypeScript + Vite, **Bun**).
  Background service worker, sidepanel, content script, MCP runtime.
- `chrome-native-host/` — Go: native messaging host, MCP server, and the
  `superduck` CLI. Built with `make`.
- `coworkd/` — Go cowork daemon.
- `desktop/`, `mac-native-addon/`, `npm/` — secondary distribution targets.

The two surfaces that most PRs touch are `chrome-crx/` and
`chrome-native-host/`. Hold them to the bars below.

## Always flag

### chrome-crx (TypeScript / Chrome extension)

- **Service worker lifetime bugs** — top-level state in `background.ts` /
  service-worker entry points that won't survive an MV3 worker restart
  (e.g. variables holding caches/sockets without `chrome.storage` /
  `chrome.alarms` rehydration).
- **`chrome.runtime.sendMessage` / port leaks** — `onMessage` handlers
  that return `true` (async) but don't always call `sendResponse`, or
  `chrome.runtime.connect` ports without `onDisconnect` cleanup.
- **`chrome.tabs` / `chrome.scripting` race conditions** — using a `tabId`
  after `chrome.tabs.onRemoved` could have fired without checking the tab
  still exists, or `executeScript` without handling the
  "Frame removed" rejection.
- **Manifest permission drift** — code that calls a `chrome.*` API not
  declared in `manifest.json` `permissions` / `host_permissions`.
- **CSP / DOM XSS** — `innerHTML`, `outerHTML`, `document.write`, or
  `dangerouslySetInnerHTML` with anything derived from web page content,
  tab titles, URLs, or message payloads. Sanitize or use
  `textContent` / DOM APIs.
- **Secret / token handling** — credentials pulled into content scripts
  (which run in untrusted page contexts), or logged via `console.log` /
  Sentry breadcrumbs without redaction.
- **`async`/`await` mistakes** — missing `await` (especially on
  `chrome.*` promise APIs), unhandled promise rejections in event
  listeners, `forEach` with `async` callbacks.
- **React (sidepanel)** — Hooks rules violations, stale closures in
  `useEffect`, missing dependency arrays causing unbounded re-renders or
  message-listener leaks (handlers not removed on unmount).
- **TypeScript strictness** — new `any`, `as unknown as ...`, or
  `// @ts-expect-error` without a justifying comment. Public exports
  without explicit types.
- **Naming** — must follow `chrome-crx/eslint.config.js`
  (`@typescript-eslint/naming-convention`): `camelCase` vars / functions,
  `PascalCase` types / components, `UPPER_CASE` module-level constants,
  `_` prefix for intentionally unused.
- **Bundle size** — newly-added heavy dependencies (`moment`, full
  `lodash`, polyfilled crypto) when a tree-shakable alternative exists.

### chrome-native-host & coworkd (Go)

- **Goroutine / context leaks** — goroutines started without a
  cancellation path, `context.Background()` used where the caller's ctx
  should propagate, missing `defer cancel()` after `context.WithCancel` /
  `WithTimeout`.
- **Error wrapping** — `return err` without `fmt.Errorf("…: %w", err)` at
  package boundaries; errors swallowed with `_ = ...` without a comment.
- **Concurrency** — shared maps / slices accessed without a mutex,
  `time.After` in a loop (memory leak), `sync.WaitGroup.Add` after
  `Wait`.
- **CLI compatibility (`superduck`)** — flag/subcommand names, exit
  codes, and stdout JSON schema are a public contract. Breaking renames
  must be flagged as a breaking change and referenced from
  `chrome-native-host/cmd/superduck/main.go` usage text.
- **Native messaging framing** — anything reading/writing the 4-byte
  little-endian length prefix must handle short reads, `io.EOF`, and
  the 1 MiB Chrome cap.
- **Naming** — Effective Go: packages all-lowercase no underscores;
  acronyms keep case (`URL`, `ID`, `HTTP`); receivers 1–2 letters;
  errors `errFoo` (unexported) / `ErrFoo` (exported); no `UPPER_CASE`
  constants.
- **Subprocess / shell** — `exec.Command` invocations built via string
  concatenation with user-controlled input.

### Cross-cutting (always check)

- **Secrets in code or logs** — API keys, tokens, customer data, paths
  with usernames. There is no commit-time secret scanner yet, so the
  reviewer is the backstop.
- **Logging hygiene** — never log full request bodies, OAuth tokens,
  cookies, page URLs that may contain query-string secrets, or PII.
  Prefer redacted / structured fields.
- **Test coverage gates** — `chrome-crx` enforces lines/statements/
  branches ≥ 90%, functions ≥ 55% via `bun run test:coverage`. Flag PRs
  that disable tests or lower thresholds.
- **AGENTS.md / README drift** — if a build/test command, directory, or
  CLI flag changes, the corresponding section in
  [`AGENTS.md`](../../../AGENTS.md) usually needs an update.
- **Dependency additions** — call out new direct deps and ask whether
  they're necessary; flag GPL / AGPL licenses.

## Skip / down-prioritize

- Pure stylistic preferences already enforced by Prettier / ESLint /
  `gofmt` / `golangci-lint`.
- Suggestions to rename for taste alone.
- Architectural rewrites in PRs that aren't refactors.
- Bikeshedding on commit messages (the title format is checked
  separately).

## Severity rubric

Use these tags inline with each finding so PR authors can triage fast:

- **P0 / blocker** — security vulnerability, data loss, crash on the hot
  path, breaks the build or release pipeline.
- **P1 / must-fix** — correctness bug under realistic input, regression
  in a covered test, leak or race.
- **P2 / should-fix** — strong code-smell, missing test for new branch,
  noticeable perf regression.
- **P3 / nit** — small clarity / consistency issue. Cap at ~3 per PR;
  prefer leaving these to humans.

When unsure, prefer fewer, higher-confidence comments over many
speculative ones.
