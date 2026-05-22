# SuperDuck issue body auto-fill (canonical instructions)

This is the **single source of truth** for the "AI fills a GitHub issue
against the repo's templates" workflow. Any coding agent — Factory Droid,
Claude Code, Codex, Cursor, Amp, future ones — must follow exactly this
document. Agent-specific entry points are thin pointers to this file:

| Agent | Entry point | Trigger |
|---|---|---|
| Factory Droid (GitHub Action) | [`.factory/skills/issue-fill/SKILL.md`](../../.factory/skills/issue-fill/SKILL.md) — committed because the CI runner must check it out | `@droid fill` on an issue ([`droid.yml`](../../.github/workflows/droid.yml)) |
| Any local agent (Claude Code / Codex / Cursor / Amp / Aider / …) | This file, surfaced via [`AGENTS.md`](../../AGENTS.md). **No per-agent wrapper lives in the repo** — `.claude/`, `.cursor/`, etc. are gitignored. | "fill issue #N" / "整理 issue #N" / "open an issue for: …" |

Update this file when the rules change. Do **not** copy rules into the
wrappers — keep them as pointers.

For the PR-description variant (not issues), follow
[`pull_request_template.md`](../../.github/pull_request_template.md)
instead; this document is specifically for issue bodies.

---

## Two modes

This skill operates in one of two modes. **Determine which mode applies
before starting.**

| Mode | When | Source material |
|------|------|-----------------|
| **Rewrite** | An existing issue needs restructuring (e.g. `@droid fill` on issue #N, or user says "整理 issue #N") | The current issue body |
| **Create** | User provides a description and asks to open a new issue (e.g. "open an issue for: …", or gives a verbal/chat description) | User's description (may be as short as one sentence) |

Key differences:

- **Rewrite** mode preserves the original body as a blockquote (see §Output shape).
- **Create** mode omits the blockquote — there is no prior "reporter text" to preserve. Instead, record the user's original request in a single line: `> 来源: "<user's original text>"` if it adds context, or omit entirely if the structured body already captures everything.
- **Create** mode skips the follow-up comment (step 8) since the agent authored the issue.

---

## Trigger

Any of the following — agent-specific entry points all reduce to "run
this workflow":

- A human opens / comments on an issue containing `@droid fill` (Droid).
- The user tells a local agent "fill issue #N" / "整理 issue #N" /
  "rewrite this issue to match the template" / pastes an issue URL and
  asks to clean it up (Claude Code, Codex, Cursor, Amp, …).
- The user gives a free-form description and asks the agent to "open an
  issue for this" — this is **Create** mode.

Example loose descriptions to fill from:

- "The side panel crashes when I press Cmd+E twice quickly on macOS"
- "perf: cdp.test.ts now takes 12s, was 3s"
- "docs: AGENTS.md still references `npm install`, should be `bun install`"
- "PostHog DAU 虚高，用户 ID 计算不准" (data quality / analytics bug)

---

## Goal

Rewrite (or create) the issue body so it matches one of the structured
templates under [`.github/ISSUE_TEMPLATE/`](../../.github/ISSUE_TEMPLATE/).
After completion, the issue must have:

- The correct labels for that template (apply via `gh issue edit --add-label`)
- A title prefixed with the template's convention (`[bug]:`, `[feat]:`,
  `[chore]:`, `[docs]:`, `[perf]:`, `[agent]:`)
- Every `required: true` field from the chosen template filled with the
  best information available — never leave a required section blank
- (Rewrite mode only) Original reporter text preserved as a `> blockquote`
  at the top under the heading `**Original report**`

---

## Workflow

### Step 0 — Check for duplicates

Before creating or rewriting, search for existing issues:

```bash
gh issue list -S "<keywords>" --state open --limit 10
```

- If a **clear duplicate** exists: do NOT create a new issue. Instead,
  comment on the existing one with the new information and tell the user.
- If a **related but different** issue exists: proceed, but add a
  `Related: #NNN` link at the bottom of the new issue body.

### Step 1 — Read the templates

Parse every `.yml` file in
[`.github/ISSUE_TEMPLATE/`](../../.github/ISSUE_TEMPLATE/) to discover
the available types, their `body:` fields, dropdown options, and which
fields are required.

Available templates (as of writing):

| Template | Title prefix | Auto-labels |
|----------|-------------|-------------|
| `bug_report.yml` | `[bug]:` | `type: bug`, `status: triage` |
| `feature_request.yml` | `[feat]:` | `type: feature`, `status: triage` |
| `chore.yml` | `[chore]:` | `type: chore`, `status: triage` |
| `docs.yml` | `[docs]:` | `type: docs`, `area: docs`, `status: triage` |
| `performance.yml` | `[perf]:` | `type: perf`, `status: triage` |
| `agent_task.yml` | `[agent]:` | `type: agent-task`, `status: ready` |

### Step 2 — Pick the best template

Use the signal matrix below. When ambiguous, prefer the more specific
template. **Fallback: if no signal clearly matches, use `bug_report.yml`.**

| Signal in the description | Template |
|---|---|
| Stack trace, "crash", "doesn't work", "broken", error message | `bug_report.yml` |
| Data incorrect, metrics wrong, counts inflated, ID mismatch | `bug_report.yml` |
| Security concern (non-vulnerability), token exposure risk | `bug_report.yml` |
| "I want", "would be nice", "add support for", "能不能" | `feature_request.yml` |
| "refactor", "upgrade dep", "clean up", "CI", "lint", "dead code" | `chore.yml` |
| "README", "AGENTS.md", "docs say", "typo", "outdated docs" | `docs.yml` |
| Numbers + "slow", "regressed", latency / memory / bundle size | `performance.yml` |
| "agent task", explicit file pointers + acceptance criteria, self-contained | `agent_task.yml` |

**Cross-cutting issues** (affects multiple components at architecture level):
use `bug_report.yml` or `feature_request.yml` depending on whether it's
a defect or a desired improvement. Add multiple `area:` labels.

### Step 3 — Investigate (Create mode with code analysis)

If the agent has access to the codebase and the issue requires technical
investigation (e.g. user says "PostHog 用户 ID 不准，帮我分析一下再提 issue"):

1. **Analyze the code** — trace the relevant logic, identify root causes,
   find affected files.
2. **Separate facts from speculation** — only include findings you can
   verify from the code. Mark uncertain parts with "(需确认)".
3. **Structure the analysis** for the template's fields (see Step 4).

This step is skipped in Rewrite mode (the reporter already wrote the body).

### Step 4 — Map fields

For each `body:` entry in the chosen template:

- **Dropdowns** — pick the option whose label best matches the report.
  For `component` / `area`, default to `chrome-crx` if the reporter
  mentioned the side panel / extension / MV3, `chrome-native-host` if
  they mentioned the CLI / native messaging / MCP server.
- **Severity / priority** — apply these guidelines conservatively:

  | Level | Criteria | Examples |
  |-------|----------|----------|
  | P0 | Data loss, security vulnerability, or main flow completely broken for all users | Extension crash on startup, credentials leaked |
  | P1 | Core feature broken with no workaround, OR data/metrics so wrong they mislead decisions | Analytics DAU inflated 3x, MCP tools silently fail |
  | P2 | Feature degraded but workaround exists, OR non-critical data inaccuracy | Slow screenshot, minor count drift |
  | P3 | Cosmetic, minor inconvenience, or improvement opportunity | UI alignment, typo in log message |

  Default to **P2** unless evidence clearly supports P0/P1/P3.

- **Free-form textareas** — follow these placement rules:

  | Content type | Where to put it |
  |---|---|
  | What the user reported / described | **Summary** |
  | Numbered reproduction steps | **Steps to reproduce** |
  | What should happen | **Expected behavior** |
  | What actually happens (symptoms) | **Actual behavior** (first part) |
  | Root cause analysis from code investigation | **Actual behavior** (after symptoms, under `**Root cause analysis:**` sub-heading) |
  | List of affected files with paths | **Actual behavior** (at the end, as a bullet list) |
  | Proposed fix / solution direction | **Do not include in the issue body.** Solutions belong in comments or a follow-up `agent_task` issue. The bug issue's job is to describe the problem, not prescribe the fix. |

- **Version / environment fields** — if the reporter didn't say, write
  `_Not provided — please add._`; do **not** invent a Chrome version.
  If the agent can determine versions from the codebase (e.g. reading
  `manifest.json`), it may fill those.
- **Checkboxes** — leave unchecked; only the reporter can attest those.

### Step 5 — Pull repo context

Reference [`AGENTS.md`](../../AGENTS.md) when useful — entry-point file
paths, build / test commands, environment variables, runbook links. Linking
the right source files (e.g. `chrome-crx/src/mcpRuntime/analytics.ts` for
an analytics bug) helps implementers.

### Step 6 — Render the new body

Render as GitHub-flavored Markdown that mirrors the template's section
headings exactly (use the `label:` text as an `##` heading). Preserve
`render: shell` / `render: markdown` blocks with fenced code where the
template asks.

### Step 7 — Apply labels and title

```bash
# Apply template labels + any additional area:/priority: labels
gh issue edit <num> --add-label "<label>"

# Set the title with template prefix
gh issue edit <num> --title "[bug]: <concise summary>"
```

Do not remove existing labels the maintainer may have added. If a
`priority:` or `area:` is now obvious from the rewrite, add it too.

### Step 8 — Follow-up comment (Rewrite mode only)

Post a short follow-up comment explaining what was filled, what is
still missing (the `_Not provided_` fields), and asking the reporter
to fill the gaps. Example:

> Rewrote this issue against `bug_report.yml`. Still missing: Chrome
> version, exact extension version, and OS. Could you add those?
> Original report preserved at the top of the body.

**Skip this step in Create mode** — the agent authored the issue and
knows exactly what's in it. A self-comment adds no value.

---

## Hard rules

- **Never include fix suggestions in the issue body.** Issues describe
  problems; solutions belong in comments or follow-up `agent_task` issues.
  Prescribing a fix in the bug body biases implementers and conflates
  problem-reporting with solution-design.
- **Never fabricate data.** Versions, stack traces, log lines, repro
  steps that the reporter didn't provide must be marked
  `_Not provided — please add._`. Exception: if the agent **verified
  facts from the codebase** (e.g. read a file path, grep'd a function),
  those are not fabricated — they are investigated findings.
- **Never drop the original text** (Rewrite mode). It goes in a
  `> blockquote` under `**Original report**` at the very top.
- **Never close, lock, or remove labels.** This skill only edits body,
  title, and adds labels.
- **Never run code, install dependencies, or open PRs.** This is a
  documentation-only task (code reading for analysis is allowed).
- **Stay under 1 issue edit + 1 comment.** Don't spam.
- **Respect security routing.** If the report looks like a security
  vulnerability, do **not** fill it — instead post a comment pointing
  the reporter to
  [GitHub Security Advisories](https://github.com/superduck-ai/superduck/security/advisories/new)
  and leave the body alone.
- **Check for duplicates before creating.** Never create a duplicate issue.

---

## Output shape (reference)

### Rewrite mode

```markdown
**Original report**

> <verbatim original body, line-prefixed with `> `>

---

## Affected component

chrome-crx (browser extension / sidepanel / service worker / MCP runtime)

## Severity

P2 — medium (feature degraded, workaround exists)

## Summary

The side panel crashes when the user presses Cmd+E twice in quick succession.

## Steps to reproduce

1. Load `chrome-crx/dist/` as an unpacked extension.
2. Press Cmd+E to open the side panel.
3. Immediately press Cmd+E again before the panel finishes mounting.
4. Observe the panel becoming blank.

## Expected behavior

The second Cmd+E should toggle the panel closed (or be a no-op),
not crash the renderer.

## Actual behavior

```shell
Uncaught TypeError: Cannot read properties of null (reading 'postMessage')
    at SidepanelApp.tsx:1234
```

**Root cause analysis:**

- `SidepanelApp.tsx:1234` — `port` is null because the previous
  `chrome.runtime.connect()` hasn't resolved when the second Cmd+E fires.
- No guard against double-initialization in `useEffect` at line 45.

Affected files:
- `chrome-crx/src/components/SidepanelApp.tsx` (line 1234, 45)
- `chrome-crx/src/service-worker.ts` (connection handler)

## Chrome version

_Not provided — please add (from `chrome://version`)._

## chrome-crx / extension version

0.1.0 (from `manifest.json`)

## Operating system

macOS (Apple Silicon)

## Relevant logs

_Not provided — please add DevTools console output from the side panel._

## Submission checklist

_Left to reporter to confirm._
```

### Create mode

Same structure as above, but:
- **No `**Original report**` blockquote** (or a minimal one-liner `> 来源: "user's words"` if it adds context)
- **No follow-up comment**
- Root cause analysis is typically more detailed since the agent investigated before creating

---

## Template-specific notes

### bug_report.yml

- **Reproduction is critical.** If the agent can provide exact steps or
  code paths, fill "Steps to reproduce" with file references and line
  numbers. If it's a data/metrics bug that can't be stepped through,
  describe how to observe the problem (e.g. "check PostHog dashboard").
- Group root cause analysis under `**Root cause analysis:**` inside
  "Actual behavior" — keep symptoms and analysis visually separated.

### feature_request.yml

- "Problem / motivation" should articulate the user pain, not jump to
  the solution.
- "Proposed solution" should include file pointers from the codebase
  where changes would likely go.
- If the request is vague ("make it faster"), ask the user to clarify
  before creating — don't guess.

### performance.yml

- **Numbers are required.** If the reporter didn't provide measurements,
  the agent should NOT create a perf issue — push back and ask for
  data, or file as a `bug_report.yml` instead.
- Include baseline vs. current in the "Measurement" field.

### chore.yml

- "Acceptance criteria" should include the exact verification commands
  (e.g. `bun run lint && bun run typecheck`).
- Keep scope small — one chore per issue.

### agent_task.yml

- Must include file pointers, constraints, and verification commands.
- If any of these are missing from the user's request, ask before creating.

### docs.yml

- Always include the affected file path or URL.
- Quote the current (wrong) text if applicable.
