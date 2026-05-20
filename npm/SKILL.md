---
name: SuperDuck
description: When the user is doing something in their Chrome browser and needs an agent (Claude Code/Codex) to read or fetch from it as the logged-in user — use the `superduck` CLI to read the active tab's url/title/selection/visible text, or to fetch a URL using the user's existing cookies/session.
---

# SuperDuck

Use the `superduck` CLI when:
- You need to know **what the user is currently looking at** in Chrome (URL, page title, selection, visible text).
- You need to **fetch data from an authenticated endpoint** that the user is already logged into in Chrome (Jira, Gmail, internal OA, GitHub Enterprise, etc.) — you do not need to ask for credentials.

The CLI talks to the user's own Chrome through a small browser extension. It is **not** a headless browser; it borrows the user's session.

## Commands

```bash
superduck context              # url + title + selection + viewport text from active tab
superduck context --full       # whole-page innerText (large; head/less recommended)
superduck context --json       # machine-readable

superduck fetch <url>          # GET; cookies of the active tab's origin auto-included
superduck fetch <url> -X POST -H 'Content-Type: application/json' -d '{"x":1}'
superduck fetch <url> --allow-cross-origin    # fetch outside current eTLD+1

superduck open <url>                          # navigate active tab; --new-tab to open new
superduck click "Login"                       # click by visible text
superduck click --selector 'button[type=submit]'
superduck fill 'input[name=q]' "claude code"  # set value + dispatch input/change
superduck press Enter --selector 'input[name=q]'

superduck tabs                 # list all Chrome tabs (debug; rarely needed)
superduck doctor               # health check
superduck log --tail 20        # ~/.superduck/audit.jsonl
```

## Conventions

- **Default same-domain:** `fetch` rejects targets outside the active tab's eTLD+1. Add `--allow-cross-origin` if the user is OK with it.
- **Active tab semantics:** "active tab" = the focused tab of the last focused Chrome window. Override with `--tab <id>`.
- **Act commands act on the live page** the user can see — be explicit with the user before running `open`/`click`/`fill`/`press` if the action is irreversible (submitting forms, sending messages, deleting). For `press Enter` on search forms, prefer `click` on the submit button: synthetic KeyboardEvents are untrusted and many sites ignore them.
- **No headless:** if `superduck doctor` says the native host is not reachable, ask the user to open Chrome / install the SuperDuck extension. Do not fall back to other browser automation.

## Self-bootstrap

If the `superduck` command is not found, it can be installed with:

```bash
npm install -g superduck-cli
superduck setup    # registers the native messaging manifest
```

After that, the user opens Chrome, installs the SuperDuck extension, and `superduck doctor` should be all green.
