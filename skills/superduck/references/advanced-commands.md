# Advanced SuperDuck Commands

Reference for less common `superduck 0.2.6` commands. Prefer checking
`superduck --help` and `superduck <command> --help` if the installed version
differs.

## Console Monitoring

Filter console output so real sites do not flood the context.

```bash
superduck --session "$SID" --tab "$TAB" console --pattern error --limit 20
superduck --session "$SID" --tab "$TAB" console --only-errors --limit 20
superduck --session "$SID" --tab "$TAB" console --clear
```

## Network Monitoring

Network tracking starts when `network` is first called for a tab. Initialize it,
trigger the request or refresh, then read filtered results.

```bash
superduck --session "$SID" --tab "$TAB" network --url-pattern /api/ --limit 20
superduck --session "$SID" --tab "$TAB" exec 'fetch("/api/ping").catch(()=>{})'
sleep 1
superduck --session "$SID" --tab "$TAB" network --url-pattern /api/ --limit 20
```

Use `--clear` after reading if you need a fresh capture window.

## Ref-Based Interaction

`read_page` returns refs for accessible elements. Refs are usually more stable
than coordinates.

```bash
superduck --session "$SID" --tab "$TAB" read_page --filter interactive
superduck --session "$SID" --tab "$TAB" left_click --ref ref_3
superduck --session "$SID" --tab "$TAB" hover --ref ref_4
superduck --session "$SID" --tab "$TAB" right_click --ref ref_5
superduck --session "$SID" --tab "$TAB" double_click --ref ref_6
```

If a ref becomes stale, rerun `read_page` immediately before using it.

## Form Input

`form_input` writes to a field ref. It does not inspect or list fields.

```bash
superduck --session "$SID" --tab "$TAB" read_page --filter interactive
superduck --session "$SID" --tab "$TAB" form_input --ref ref_7 --value "Ada Lovelace"
superduck --session "$SID" --tab "$TAB" form_input --ref ref_8 --value "true" --string
```

If `form_input` fails on a field, use `left_click --ref` followed by `type`, or
set the field with `exec` and dispatch `input`/`change` events.

## Scrolling

`scroll` sends wheel ticks at a viewport coordinate.

```bash
superduck --session "$SID" --tab "$TAB" scroll 900 700 --direction down --amount 5
superduck --session "$SID" --tab "$TAB" scroll 900 300 --direction up --amount 3
```

`scroll_to` scrolls an element ref into view.

```bash
superduck --session "$SID" --tab "$TAB" read_page
superduck --session "$SID" --tab "$TAB" scroll_to --ref ref_12
```

For absolute page positions, use JavaScript:

```bash
superduck --session "$SID" --tab "$TAB" exec 'window.scrollTo(0, 0)'
superduck --session "$SID" --tab "$TAB" exec 'window.scrollTo(0, document.body.scrollHeight)'
```

## Screenshots, Region Zoom, and Resize

```bash
superduck --session "$SID" --tab "$TAB" screenshot --output /tmp/
superduck --session "$SID" --tab "$TAB" screenshot --output /tmp/step1.jpg
superduck --session "$SID" --tab "$TAB" zoom 100 100 600 500 --output /tmp/region.jpg
superduck --session "$SID" --tab "$TAB" resize 1366 768
```

`zoom` captures or inspects a rectangular region. It is not browser page zoom.
For screenshot output, a directory path ending in `/` auto-generates a filename;
a file path uses that basename but may be extension-aligned to the real image
format, commonly `.jpg`.

## Uploads

Two commands, picked by source — both target the page via `--ref` or `--coord`:

- `upload_image` drops an image already in the session (prior `screenshot` or
  user-uploaded image, referenced by `--image-id`) onto a file input or drag
  target. `--filename` defaults to `image.png`.
- `upload_file` uploads one or more local files from disk via repeatable
  `--path` (absolute paths; the input needs `multiple` for more than one).

```bash
superduck --session "$SID" --tab "$TAB" upload_image --image-id <id> --ref ref_9 --filename image.png
superduck --session "$SID" --tab "$TAB" upload_image --image-id <id> --coord 500,400
superduck --session "$SID" --tab "$TAB" upload_file --path /abs/report.pdf --ref ref_9
```

## Shortcuts

Shortcuts are saved prompts stored in the extension. The CLI fetches prompts for
the local agent; it does not execute them.

```bash
superduck shortcuts list
superduck shortcuts list --json
superduck shortcuts get <name-or-id> --show-vars
superduck shortcuts get <name-or-id> --var search_query=deepseek --json
```

## GIF Recording

GIF commands require `--tab`, but actions performed through CLI commands may
record 0 frames. Use screenshots plus `ffmpeg` for CLI-only workflows.

```bash
superduck --session "$SID" gif start --tab "$TAB"
# perform MCP/browser actions
superduck --session "$SID" gif stop --tab "$TAB"
superduck --session "$SID" gif export --tab "$TAB" --download --filename workflow.gif
```

## Keyboard and Coordinates

```bash
superduck --session "$SID" --tab "$TAB" key Enter
superduck --session "$SID" --tab "$TAB" key "Control+a"
superduck --session "$SID" --tab "$TAB" left_click 300 400
superduck --session "$SID" --tab "$TAB" left_click_drag 100 200 500 300
superduck --session "$SID" --tab "$TAB" triple_click 400 300
```

Modifier behavior depends on focus, OS, and page handlers. For high-reliability
text replacement, prefer `form_input` or `exec`.

## JSON Output Mode

```bash
superduck --json tabs
superduck --json --session "$SID" --tab "$TAB" context
```

`tabs --json` and `context --json` are structured. Many action commands return
JSON envelopes whose `output` value is still human-readable text and may include
`Tab Context`.

## Custom Socket and Timeout

```bash
superduck --socket /custom/path/to/socket.sock version
superduck --timeout 60 --session "$SID" --tab "$TAB" navigate https://very-slow-site.com
```
