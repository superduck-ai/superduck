#!/usr/bin/env bash
# Smoke-test every top-level superduck CLI command against testdata/cli_test.html.
# Requires the SuperDuck Chrome extension to be loaded and reachable.
#
# Page is served from a small Go server so /api/ and other http-only features
# (network capture, etc.) work end-to-end:
#
#   go run ./testdata/server -addr :8765 &
#   ./testdata/run_cli_test.sh
#
# Override the URL with SD_TEST_URL=... if you serve it elsewhere.

set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SD="$HERE/superduck"
PAGE="${SD_TEST_URL:-http://localhost:8765/}"
OUT=/tmp/sd_cli_test
mkdir -p "$OUT"

echo "==> ensure MCP tab group exists"
"$SD" tab_group list --create-if-empty >/dev/null

echo "==> create a fresh tab in the MCP group"
TAB=$("$SD" tab_group new | sed -n 's/.*Tab ID: *\([0-9][0-9]*\).*/\1/p' | head -1)
if [ -z "$TAB" ]; then
  echo "could not resolve new tabId from 'tab_group new' output" >&2
  exit 1
fi
echo "    tabId=$TAB"

echo "==> navigate the new tab to $PAGE"
"$SD" --tab "$TAB" navigate "$PAGE" >/dev/null
sleep 3   # let the page render and CDP settle (avoids "Detached while handling")

run() { echo; echo "==> $*"; "$SD" --tab "$TAB" "$@" || echo "    (^^ command failed, continuing)"; }

# 1. screenshot — saves <uuid>.jpg into OUT/
run screenshot --output "$OUT/"

# 2. zoom the red-grid region
run zoom 40 40 260 260 --output "$OUT/"

# 3. click buttons (approximate coords; adjust if layout differs)
run left_click  80  150
run right_click 230 150
run double_click 370 150
run triple_click 520 150

# 4. hover the hover box
run hover 80 320

# 5. focus the input and type
run left_click 200 420
run type "hello superduck"
run key "cmd+a"
run key "Backspace"

# 6. drag from DRAG box to DROP box
run left_click_drag 70 560 215 560

# 7. scroll down
run scroll 400 400 --direction down --amount 8

# 8. scroll_to (will fail cleanly if no ref system is wired up)
run scroll_to --ref nonexistent_ref || true

# 9. wait
run wait 0.3

echo
echo "==> final screenshot (to visually confirm)"
run screenshot --output "$OUT/final.png"

echo
echo "==> exec (page title via javascript_tool)"
run exec "document.title"

echo "==> page_text (main text)"
run page_text | head -6

echo "==> find 'submit'"
run find "submit button"

echo "==> read_page interactive depth 6"
run read_page --filter interactive --depth 6 --max-chars 3000 | head -25

echo "==> console (trigger log+error, then read)"
run exec "document.getElementById('btnLog').click(); document.getElementById('btnErr').click();" >/dev/null
run console --pattern "superduck" --limit 20 | head -15

echo "==> network (arm tracker, trigger fetch, then read)"
run network --limit 1 >/dev/null   # arm tracker
run exec "document.getElementById('btnFetch').click();" >/dev/null
sleep 0.8
run network --url-pattern "/api/" --limit 5 | head -20

echo "==> resize 1100x780"
run resize 1100 780

echo "==> navigate: baidu -> back -> forward"
run navigate https://www.baidu.com; sleep 1.2
run navigate back; sleep 0.8
run navigate forward; sleep 0.8

echo "==> shortcuts list"
run shortcuts list | head -10

echo "==> gif start/stop/clear"
run gif start
run wait 0.5 >/dev/null
run gif stop
run gif clear

echo "==> tab_group list (final group snapshot)"
"$SD" tab_group list | head -20

echo
echo "results in $OUT/"
ls -l "$OUT"
