---
name: superduck
description: "Browser automation via the SuperDuck Chrome/Edge extension. Use when SuperDuck is installed: controls the user's own browser with existing sessions, cookies, and login state intact. Ideal for tasks on sites the user is already logged into, or when controlling their real browser matters. Triggers: use my browser, I'm logged into, use my Chrome, search this site, open a page, scrape a page, inspect comments, or any browser task when SuperDuck extension is available. Not for headless/cloud browsers; SuperDuck talks to the user's local browser via superduck CLI."
allowed-tools: Bash(superduck *)
---

# Browser Automation with SuperDuck

Use SuperDuck to control the user's local Chrome/Edge browser through the
`superduck` CLI. It uses the user's real browser state, including existing
cookies and logins.

This skill is tested against `superduck 0.2.6`. If behavior looks wrong, run
`superduck version` and `superduck --help` before trusting older examples.

## Core Workflow

Prefer element refs from `read_page` over coordinates. Coordinates are a
fallback for canvas, custom widgets, or elements that do not expose a useful ref.

```bash
superduck doctor
TAB=$(superduck tab_group new | grep -o 'Tab ID: [0-9]*' | grep -o '[0-9]*')
superduck --tab "$TAB" navigate https://example.com/
superduck --tab "$TAB" context
superduck --tab "$TAB" read_page --filter interactive
superduck --tab "$TAB" left_click --ref ref_1
```

New tabs usually start on a Chrome internal page. Navigate to an `https://`
page before using `exec`, `read_page`, or screenshots. `about:` and `data:`
URLs may be rejected by `navigate`.

## Tab Management

```bash
superduck tab_group list --create-if-empty
superduck tab_group new
superduck tabs
superduck --tab "$TAB" context
```

`tab_group new` prints human-readable output, so extract the tab id with a
regex. `tabs --json` and `context --json` are structured; many other `--json`
commands still wrap human-readable output in an `output` string.

## Navigation and Waiting

```bash
superduck --tab "$TAB" navigate https://example.com/
superduck --tab "$TAB" context
sleep 2
```

Use `context` to verify load. If using `wait`, the unit is seconds:
`superduck --tab "$TAB" wait 1`, not `wait 1000`.

## Reading and Extraction

```bash
superduck --tab "$TAB" read_page --filter interactive
superduck --tab "$TAB" page_text
superduck --tab "$TAB" exec 'JSON.stringify({title: document.title, url: location.href})'
```

`page_text` is quick but may compress whitespace. Use `exec` for structured
data. The helper `scripts/extract-data.mjs` strips the trailing `Tab Context`
from `exec` output and is safer for repeated scraping tasks.

## Interaction

Use refs when possible:

```bash
superduck --tab "$TAB" read_page --filter interactive
superduck --tab "$TAB" left_click --ref ref_3
superduck --tab "$TAB" hover --ref ref_4
superduck --tab "$TAB" right_click --ref ref_5
superduck --tab "$TAB" double_click --ref ref_6
```

Use coordinates only when needed:

```bash
superduck --tab "$TAB" left_click 300 400
superduck --tab "$TAB" type "text to type"
superduck --tab "$TAB" key Enter
```

Keyboard modifier behavior can vary by OS/browser focus. For fragile form
editing, prefer `exec` or `form_input --ref ... --value ...` when the ref works.

## Forms

`form_input` writes a value to a field ref; it does not list fields.

```bash
superduck --tab "$TAB" read_page --filter interactive
superduck --tab "$TAB" form_input --ref ref_7 --value "Ada Lovelace"
```

If `form_input` reports a stale ref, rerun `read_page`, or focus the field with
`left_click --ref` and use `type`. For complex forms, use `exec` to set values
and dispatch input/change events.

## Scrolling

`scroll` sends wheel ticks at a viewport coordinate:

```bash
superduck --tab "$TAB" scroll 800 700 --direction down --amount 5
superduck --tab "$TAB" scroll 800 300 --direction up --amount 3
```

`scroll_to` scrolls an element ref into view:

```bash
superduck --tab "$TAB" read_page
superduck --tab "$TAB" scroll_to --ref ref_12
```

For top/bottom page jumps, use JavaScript:

```bash
superduck --tab "$TAB" exec 'window.scrollTo(0, document.body.scrollHeight)'
```

## Screenshots and Visual Checks

```bash
superduck --tab "$TAB" screenshot --output /tmp/
superduck --tab "$TAB" screenshot --output /tmp/step1.jpg
superduck --tab "$TAB" zoom 100 100 600 500 --output /tmp/region.jpg
```

`--output /tmp/` saves an auto-named JPEG. `--output /tmp/name.png` may be
written as `/tmp/name.jpg` when the browser returns JPEG data. `zoom` captures a
rectangular region; it is not page zoom. Use `resize <width> <height>` to change
the browser window size.

## Console and Network

Always filter noisy pages:

```bash
superduck --tab "$TAB" console --pattern error --limit 20
superduck --tab "$TAB" console --only-errors --limit 20
superduck --tab "$TAB" network --url-pattern /api/ --limit 20
```

Network tracking starts when `network` is first called. Call it once, trigger
the request or refresh the page, then call it again to inspect captured entries.

## Uploads, Shortcuts, and GIFs

Current upload support is image-oriented:

```bash
superduck --tab "$TAB" upload --image-id <id> --ref ref_9 --filename image.png
superduck --tab "$TAB" upload --image-id <id> --coord 500,400
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
