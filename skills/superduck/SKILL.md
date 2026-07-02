---
name: superduck
description: "Control the user's local Chrome/Edge browser through the SuperDuck extension and `superduck` CLI. Use when a task needs the real browser session: current tab context, logged-in sites, cookies, navigation, page reading/scraping, form interaction, screenshots, or managed tab handoff. Triggers include: use my browser, use my Chrome, I'm logged in, open/navigate a page, read/scrape this page, inspect comments, click/fill a page, or capture a screenshot. Do not use for headless/cloud browser work."
allowed-tools: Bash(superduck *)
---

# Browser Automation with SuperDuck

Use SuperDuck to control the user's local Chrome/Edge browser through the
`superduck` CLI. It uses the user's real browser state, including existing
cookies and logins.

This skill assumes the current CLI contract where JSON tab-group commands expose
`.tabContext.currentTabId`. If behavior looks wrong, run `superduck version` and
`superduck --help` before adapting examples to the installed binary.

## Core Workflow

Prefer element refs from `read_page` over coordinates. Coordinates are a
fallback for canvas, custom widgets, or elements that do not expose a useful ref.

```bash
superduck doctor
# Mint one session id per task and pass it to every browser command so this
# task owns its own tab group and does not collide with other concurrent tasks.
SID=$(superduck session new)
# Create (or reuse) the session's tab group and name it in one step.
# The 🦆 marker is auto-prepended. --name is ignored if the group already exists.
TAB=$(superduck --session "$SID" --json tab_group list --create-if-empty --name "🔎 <short task name>" \
  | jq -r '.tabContext.currentTabId')
superduck --session "$SID" --tab "$TAB" navigate https://example.com/
superduck --session "$SID" --tab "$TAB" context
superduck --session "$SID" --tab "$TAB" read_page
superduck --session "$SID" --tab "$TAB" read_page --filter interactive
superduck --session "$SID" --tab "$TAB" left_click --ref ref_1
# Before ending a turn that did any browser work, run finalize — it must be
# the last browser action of the turn. Do not call browser tools after it.
superduck --session "$SID" tab_group finalize
```

If you skip `--session`, CLI calls in the same shell fall back to a shared
`cli:ppid:<parent-pid>` session, so concurrent tasks from that shell would step
on each other's tabs. Mint a fresh `SID` per task with `superduck session new`
instead. Pass `--name "🔎 <task>"` to `tab_group list --create-if-empty` to title the group at
creation; the 🦆 marker is always prepended automatically (do not add it
yourself), so every SuperDuck-opened group is identifiable at a glance. To
rename a group mid-task, run `superduck --session "$SID" session name "<text>"`.

New tabs usually start on a Chrome internal page. Navigate to an `https://`
page before using `exec`, `read_page`, or screenshots. `about:` and `data:`
URLs may be rejected by `navigate`.

## Tab Lifecycle

Start by reusing the current session group:

```bash
superduck --session "$SID" tab_group list --create-if-empty
```

Capture the tab id from the JSON envelope. `tabContext.currentTabId` is the
canonical field used by the current CLI and help text:

```bash
TAB=$(superduck --session "$SID" --json tab_group list --create-if-empty \
  | jq -r '.tabContext.currentTabId')
```

Do not run `tab_group new` after `tab_group list --create-if-empty`. That creates
an unused group before the real work starts. Use exactly one tab acquisition
command for a task: normally `tab_group list --create-if-empty`. Use
`superduck --session "$SID" tab_group new --force` only when you intentionally
want to discard the current session group and start a separate context.

Same-session continuation is automatic while you are doing the browser work.
Before ending any turn that did browser work, run exactly one
`superduck --session "$SID" tab_group finalize` command so the managed group is
released. Treat finalize as the last browser action of the turn: do not call any
SuperDuck browser tool after finalizing. If more browser work is needed in a
later turn, do it then and finalize again at the end of that turn. Do not answer
the user, ask a follow-up, or inspect the repo for cleanup details before
running finalize; decide the tab disposition from the task outcome.

Omit tabs by default. `finalize` never closes a tab — it only releases the
managed tab group. Omitted tabs are ungrouped (removed from the managed group)
and left open in the window, so the user's pages are never lost. Omit research,
search, source, intermediate, duplicate, blank, error, and login/navigation
tabs once you have what you need; they will simply leave the managed group and
stay open. If the user asked a question and the answer can be given in the
chat, omit the tab even if it helped you answer. Do not ask the user whether to
clean up ordinary intermediate tabs; make the disposition decision from the
task outcome.

Use `--deliverable TAB` when the tab itself is a user-facing output or a page
the user explicitly asked to keep open or inspect directly. Examples include a
created/edited document, dashboard, checkout/cart, submitted form result, or a
requested open page. Deliverable tabs stay open, leave the managed tab group,
and get a ✓ badge so the user can spot them:

```bash
superduck --session "$SID" tab_group finalize --deliverable "$TAB"
```

Use `--handoff TAB` only when the task is unfinished and a later turn should
continue from that live page, such as a login, approval, payment, CAPTCHA, or
other user-input checkpoint. Handoff tabs stay in the managed tab group for
continuation:

```bash
superduck --session "$SID" tab_group finalize --handoff "$TAB"
```

Omitted tabs (SuperDuck-created or user-origin) are ungrouped and left open —
finalize releases the managed group, it never closes your pages.

## Tab Management

```bash
superduck --session "$SID" tab_group list --create-if-empty
superduck --session "$SID" tab_group finalize
superduck tabs
superduck --session "$SID" --tab "$TAB" context
```

`tab_group list --create-if-empty` is the normal reuse path. `tab_group new`
requires `--force` after a session group exists and should not be part of normal
browser work. `tabs --json` and `context --json` are structured; many other
`--json` commands still wrap human-readable output in an `output` string.

## Navigation and Waiting

```bash
superduck --session "$SID" --tab "$TAB" navigate https://example.com/
superduck --session "$SID" --tab "$TAB" context
sleep 2
```

Use `context` to verify load. If using `wait`, the unit is seconds:
`superduck --session "$SID" --tab "$TAB" wait 1`, not `wait 1000`.

## Reading and Extraction

```bash
superduck --session "$SID" --tab "$TAB" read_page --filter interactive
superduck --session "$SID" --tab "$TAB" page_text
superduck --session "$SID" --tab "$TAB" exec 'JSON.stringify({title: document.title, url: location.href})'
```

`page_text` is quick but may compress whitespace. Use `exec` for structured
data. The helper `scripts/extract-data.mjs` strips the trailing `Tab Context`
from `exec` output and is safer for repeated scraping tasks.

## Interaction

Use refs when possible:

```bash
superduck --session "$SID" --tab "$TAB" read_page --filter interactive
superduck --session "$SID" --tab "$TAB" left_click --ref ref_3
superduck --session "$SID" --tab "$TAB" hover --ref ref_4
superduck --session "$SID" --tab "$TAB" right_click --ref ref_5
superduck --session "$SID" --tab "$TAB" double_click --ref ref_6
```

Use coordinates only when needed:

```bash
superduck --session "$SID" --tab "$TAB" left_click 300 400
superduck --session "$SID" --tab "$TAB" type "text to type"
superduck --session "$SID" --tab "$TAB" key Enter
```

Keyboard modifier behavior can vary by OS/browser focus. For fragile form
editing, prefer `exec` or `form_input --ref ... --value ...` when the ref works.

## Forms

`form_input` writes a value to a field ref; it does not list fields.

```bash
superduck --session "$SID" --tab "$TAB" read_page --filter interactive
superduck --session "$SID" --tab "$TAB" form_input --ref ref_7 --value "Ada Lovelace"
```

If `form_input` reports a stale ref, rerun `read_page`, or focus the field with
`left_click --ref` and use `type`. For complex forms, use `exec` to set values
and dispatch input/change events.

## Scrolling

`scroll` sends wheel ticks at a viewport coordinate:

```bash
superduck --session "$SID" --tab "$TAB" scroll 800 700 --direction down --amount 5
superduck --session "$SID" --tab "$TAB" scroll 800 300 --direction up --amount 3
```

`scroll_to` scrolls an element ref into view:

```bash
superduck --session "$SID" --tab "$TAB" read_page
superduck --session "$SID" --tab "$TAB" scroll_to --ref ref_12
```

For top/bottom page jumps, use JavaScript:

```bash
superduck --session "$SID" --tab "$TAB" exec 'window.scrollTo(0, document.body.scrollHeight)'
```

## Screenshots and Visual Checks

```bash
superduck --session "$SID" --tab "$TAB" screenshot --output /tmp/
superduck --session "$SID" --tab "$TAB" screenshot --output /tmp/step1.jpg
superduck --session "$SID" --tab "$TAB" zoom 100 100 600 500 --output /tmp/region.jpg
```

`--output /tmp/` saves an auto-named JPEG. `--output /tmp/name.png` may be
written as `/tmp/name.jpg` when the browser returns JPEG data. `zoom` captures a
rectangular region; it is not page zoom. Use `resize <width> <height>` to change
the browser window size.

## Console and Network

Always filter noisy pages:

```bash
superduck --session "$SID" --tab "$TAB" console --pattern error --limit 20
superduck --session "$SID" --tab "$TAB" console --only-errors --limit 20
superduck --session "$SID" --tab "$TAB" network --url-pattern /api/ --limit 20
```

Network tracking starts when `network` is first called. Call it once, trigger
the request or refresh the page, then call it again to inspect captured entries.

## Image Uploads, Shortcuts, and GIFs

`upload` is image-oriented: it drops a previously captured/generated image onto
a file input or coordinate target. For arbitrary local filesystem paths (PDFs,
spreadsheets, etc.), use `upload_file` instead.

```bash
superduck --session "$SID" --tab "$TAB" upload --image-id <id> --ref ref_9 --filename image.png
superduck --session "$SID" --tab "$TAB" upload --image-id <id> --coord 500,400
```

Upload local files from disk (the browser reads them directly — no content is transferred):

```bash
# Target a known <input type=file> via ref
superduck --session "$SID" --tab "$TAB" upload_file --path /abs/path/report.pdf --ref ref_9

# Click a button/label that opens the native file picker (intercepted automatically)
superduck --session "$SID" --tab "$TAB" upload_file --path /abs/path/photo.png --coord 500,400

# Multiple files
superduck --session "$SID" --tab "$TAB" upload_file --path /abs/a.pdf --path /abs/b.pdf --ref ref_9
```


Shortcuts are saved prompts, not directly executed workflows:

```bash
superduck shortcuts list
superduck shortcuts get <name-or-id> --json
```

`gif start/stop/export` requires `--tab`, but CLI-triggered actions may capture
0 frames. For CLI workflows, prefer screenshots plus `ffmpeg`.

## Reference Documentation

- [Advanced Commands](references/advanced-commands.md): command syntax and less common operations.
- [Data Extraction](references/data-extraction.md): robust extraction patterns and helper script use.
- [Troubleshooting](references/troubleshooting.md): common failures and fixes.

## Helper Scripts and Templates

- `scripts/extract-data.mjs`: scrape selector text/href/html as clean JSON.
- `scripts/check-superduck-status.mjs`: quick local install/socket check.
- `templates/web-scraping.sh`: shell wrapper around `extract-data.mjs`.
- `templates/screenshot-comparison.sh`: capture multiple URLs.
- `templates/form-automation.sh`: form filling scaffold.
