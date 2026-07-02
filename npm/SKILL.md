---
name: SuperDuck
description: When the user is doing something in their Chrome browser and needs an agent to inspect or control it as the logged-in user - use the `superduck` CLI to reuse a managed tab group, read page context, navigate, and interact with the live browser using the user's existing cookies/session.
metadata:
  internal: true
---

# SuperDuck

Use the `superduck` CLI when:

- You need to know **what the user is currently looking at** in Chrome (URL, page title, selection, visible text).
- You need to **inspect or operate an authenticated page** that the user is already logged into in Chrome (Jira, Gmail, internal OA, GitHub Enterprise, etc.) - you do not need to ask for credentials.

The CLI talks to the user's own Chrome through a small browser extension. It is **not** a headless browser; it borrows the user's session.

## Commands

```bash
superduck context              # url + title + selection + viewport text from active tab
superduck context --full       # whole-page innerText (large; head/less recommended)
superduck context --json       # machine-readable

superduck tabs                 # list all Chrome tabs (debug; rarely needed)
SID=$(superduck session new)  # mint one session id per task for tab isolation
superduck --session "$SID" session name "🔎 task name"  # optional: label the tab group
TAB=$(superduck --session "$SID" --json tab_group list --create-if-empty | jq -r '(.tabContext.currentTabId // empty) // (.output | capture("tabId (?<id>[0-9]+)").id)')  # tabContext (newer CLI) else parse .output (0.2.6)
superduck --session "$SID" --tab "$TAB" navigate https://example.com/
superduck --session "$SID" --tab "$TAB" read_page --filter interactive
superduck --session "$SID" --tab "$TAB" left_click --ref ref_1
superduck --session "$SID" --tab "$TAB" form_input --ref ref_2 --value "search text"
superduck --session "$SID" --tab "$TAB" key "Enter"
superduck --session "$SID" --tab "$TAB" screenshot --output /tmp/
superduck --session "$SID" tab_group finalize --deliverable "$TAB"

superduck session new                         # mint a fresh per-task session id
superduck session name "🔎 text"              # label this session's tab group
superduck tab_group list --create-if-empty    # show or create and reuse the session group
superduck tab_group new --force               # rare: replace the session group with a fresh one
superduck tab_group finalize                  # explicitly decide tab disposition
superduck tab_group finalize --deliverable 123
superduck tab_group finalize --handoff 123
superduck doctor               # health check
superduck log --tail 20        # ~/.superduck/audit.jsonl
```

## Conventions

- **One session per task:** mint `SID=$(superduck session new)` at the start of each browser task and pass `--session "$SID"` to every command, so concurrent tasks keep separate tab groups. Without `--session`, all calls share one global session and step on each other's tabs.
- **Reuse first:** start browser work with `superduck --session "$SID" tab_group list --create-if-empty`, store the returned tab id, and pass `--tab "$TAB"` to navigation, observation, and action commands.
- **Active tab semantics:** commands without `--tab`, such as `context`, read the focused tab of the last focused Chrome window. Browser automation commands should use the tab id from the managed group.
- **Act commands act on the live page** the user can see - be explicit with the user before running `navigate`/`left_click`/`form_input`/`key` if the action is irreversible (submitting forms, sending messages, deleting).
- **Tab lifecycle:** use `superduck tab_group list --create-if-empty` to reuse the current session group. Do not run `tab_group new` after `list --create-if-empty`; use `tab_group new --force` only when you intentionally want to replace the current session group with a fresh one. Same-session continuation is automatic while browser work is in progress. When the requested browser work is done, run exactly one `superduck tab_group finalize` before your final response; do not ask a follow-up before finalizing. `finalize` never closes a tab — omitted tabs are ungrouped and left open. Use `--deliverable TAB` to mark a final page the user should keep open (✓ badge), and use `--handoff TAB` only when a later turn must continue from that live page.
- **No headless:** if `superduck doctor` says the native host is not reachable, ask the user to open Chrome / install the SuperDuck extension. Do not fall back to other browser automation.

## Self-bootstrap

If the `superduck` command is not found, it can be installed with:

```bash
npm install -g superduck-cli
superduck setup    # registers the native messaging manifest
```

After that, the user opens Chrome, installs the SuperDuck extension, and `superduck doctor` should be all green.
