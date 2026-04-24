#!/usr/bin/env bash
# Visual regression driver for superduck CLI.
# Each step takes a screenshot to /tmp/sd_visual/step-NN-<name>.png, so that a
# vision-capable reviewer (Claude Code) can judge whether the UI reacted as
# expected.
#
#   go run ./testdata/server -addr :8765 &
#   ./testdata/visual_test.sh
#   # then feed testdata/visual_test.prompt.md to Claude Code

set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SD="$HERE/superduck"
PAGE="${SD_TEST_URL:-http://localhost:8765/}"
OUT="/tmp/sd_visual"
REPORT="$OUT/report.txt"
rm -rf "$OUT"; mkdir -p "$OUT"
: > "$REPORT"

STEP=0
step() {
  STEP=$((STEP+1))
  local name="$1"; shift
  printf '\n=== step %02d: %s ===\n' "$STEP" "$name" | tee -a "$REPORT"
  local label; label=$(printf 'step-%02d-%s' "$STEP" "$name")
  "$SD" --tab "$TAB" screenshot --output "$OUT/$label.png" >>"$REPORT" 2>&1 || true
}

run() {
  echo "-- $* " | tee -a "$REPORT"
  "$SD" --tab "$TAB" "$@" >>"$REPORT" 2>&1 || true
}

echo "==> ensure MCP tab group" | tee -a "$REPORT"
"$SD" tab_group list --create-if-empty >>"$REPORT" 2>&1 || true
TAB_COUNT=$("$SD" tab_group list 2>/dev/null | head -1 | sed -n 's/.*(\([0-9]\+\) tabs.*/\1/p')
if [ -n "${TAB_COUNT:-}" ] && [ "${TAB_COUNT:-0}" -gt 15 ]; then
  echo "    WARN: MCP group has $TAB_COUNT tabs — extension may misbehave." | tee -a "$REPORT"
  echo "          reload the SuperDuck extension in chrome://extensions to reset." | tee -a "$REPORT"
fi

echo "==> resolve tab for $PAGE" | tee -a "$REPORT"
if [ "${SD_TAB:-}" != "" ]; then
  TAB="$SD_TAB"
  "$SD" --tab "$TAB" navigate "$PAGE" >>"$REPORT" 2>&1 || true
  sleep 2
else
  TAB=$("$SD" tab_group new | sed -n 's/.*Tab ID: *\([0-9][0-9]*\).*/\1/p' | head -1)
  if [ -z "$TAB" ]; then
    echo "could not resolve new tabId from 'tab_group new' output" | tee -a "$REPORT"
    exit 1
  fi
  "$SD" --tab "$TAB" navigate "$PAGE" >>"$REPORT" 2>&1 || true
  sleep 3
fi
echo "    tabId=$TAB" | tee -a "$REPORT"

step initial

# --- interactions driven exclusively through the superduck CLI ---

# 1) clicks: hit the four test buttons (approximate coords for the row in
#    section 1; the buttons are large so this is not fragile).
run left_click 78 155;   step after-left-click
run right_click 235 155; step after-right-click
run double_click 380 155; step after-double-click
run triple_click 545 155; step after-triple-click

# 2) hover box — a single mouse move over it turns it orange
run hover 80 335; step after-hover

# 3) type: focus the input (click it), type, screenshot
run left_click 200 430; sleep 0.2
run type "hello superduck"; step after-type

# 4) drag: src at roughly (90,850), dst at (230,850) — with scroll reset
run scroll 400 400 --direction up --amount 10 >/dev/null 2>&1
sleep 0.3
run left_click_drag 95 855 240 855; step after-drag

# 5) scroll: go all the way to the bottom
run scroll 400 400 --direction down --amount 15; step after-scroll-down
# back up
run scroll 400 400 --direction up --amount 15; step after-scroll-up

# 6) network: arm, click fetch (via coord), read
run network --limit 1 >/dev/null 2>&1 || true
# find the fetch button coord — it's in section "console / network playground"
run left_click 260 500; sleep 0.6
run network --url-pattern "/api/" --limit 5
step after-network-fetch

# 7) console: click log+error buttons, read
run left_click 105 500
run left_click 165 500
run console --pattern "superduck" --limit 10
step after-console-capture

# 8) resize: narrow the window — observable as layout reflow
run resize 600 780; sleep 0.5; step after-resize-narrow
run resize 1000 780; sleep 0.5

# 9) navigation: go to baidu, back, forward
run navigate https://www.baidu.com; sleep 2; step after-navigate-baidu
run navigate back;                    sleep 1.5; step after-navigate-back
run navigate forward;                 sleep 1.5; step after-navigate-forward

# 10) back to test page
run navigate "$PAGE"; sleep 2; step final

echo
echo "wrote $STEP screenshots to $OUT/"
ls "$OUT" | grep '^step-' | sort
