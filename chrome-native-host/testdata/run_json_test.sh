#!/usr/bin/env bash
# Validate that every CLI command honors --json: stdout must be a single
# valid JSON object. We don't check semantics here — Bug 1 (ref persistence)
# can still cause the underlying tool call to fail; we only require that
# whatever superduck emits parses as JSON.
#
# Usage:
#   go run ./testdata/server -addr :8765 &
#   ./testdata/run_json_test.sh

set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SD="$HERE/superduck"
PAGE="${SD_TEST_URL:-http://localhost:8765/}"
OUT="/tmp/sd_json"
rm -rf "$OUT"; mkdir -p "$OUT"

PASS=0; FAIL=0
FAILED_NAMES=()

# is_json <file> — returns 0 if file contains exactly one valid JSON value.
is_json() {
  python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$1" 2>/dev/null
}

# check <name> <stdout-file> — assert the file is valid JSON.
check() {
  local name="$1"; local f="$2"
  if is_json "$f"; then
    PASS=$((PASS+1)); printf '  PASS  %s\n' "$name"
  else
    FAIL=$((FAIL+1)); FAILED_NAMES+=("$name")
    printf '  FAIL  %s\n' "$name"
    printf '        first 200 bytes: %s\n' "$(head -c 200 "$f" | tr '\n' ' ')"
  fi
}

# run <name> <args...> — execute superduck --json, save stdout, validate.
run() {
  local name="$1"; shift
  local f="$OUT/${name//[^A-Za-z0-9]/_}.json"
  "$SD" --json "$@" >"$f" 2>"$f.err" || true
  check "$name" "$f"
}

# run_tab <name> <args...> — like run, with --tab prepended.
run_tab() {
  local name="$1"; shift
  local f="$OUT/${name//[^A-Za-z0-9]/_}.json"
  "$SD" --json --tab "$TAB" "$@" >"$f" 2>"$f.err" || true
  check "$name" "$f"
}

# ---- bootstrap -------------------------------------------------------------
echo "==> ensure MCP tab group + fresh tab"
"$SD" tab_group list --create-if-empty >/dev/null
TAB=$("$SD" tab_group new | sed -n 's/.*Tab ID: *\([0-9][0-9]*\).*/\1/p' | head -1)
[ -n "$TAB" ] || { echo "could not resolve tabId"; exit 1; }
echo "    tabId=$TAB"
"$SD" --tab "$TAB" navigate "$PAGE" >/dev/null
sleep 2

# ---- no-tab commands --------------------------------------------------------
echo
echo "==> no-tab commands"
run "tabs"                       tabs
run "tab_group_list"             tab_group list
run "tab_group_list_create"      tab_group list --create-if-empty
run "context"                    context
run "context_full"               context --full
# log emits JSONL (one record per line); validate every line parses.
LOG_F="$OUT/log_tail.jsonl"
"$SD" --json log --tail 5 >"$LOG_F" 2>"$LOG_F.err" || true
if [ -s "$LOG_F" ] && python3 -c '
import json,sys
for line in open(sys.argv[1]):
    line=line.strip()
    if line: json.loads(line)
' "$LOG_F" 2>/dev/null; then
  PASS=$((PASS+1)); printf '  PASS  log_tail (jsonl)\n'
else
  FAIL=$((FAIL+1)); FAILED_NAMES+=("log_tail")
  printf '  FAIL  log_tail (jsonl)\n'
fi

# tab_group new gets its own throwaway tab; close it after we're done.
NEW_TAB_F="$OUT/tab_group_new.json"
"$SD" --json tab_group new >"$NEW_TAB_F" 2>"$NEW_TAB_F.err" || true
check "tab_group_new" "$NEW_TAB_F"

# ---- page / DOM -------------------------------------------------------------
echo
echo "==> page / DOM"
run_tab "navigate"            navigate "$PAGE"
sleep 1
run_tab "exec"                exec 'document.title'
run_tab "page_text"           page_text
run_tab "read_page"           read_page --filter interactive --depth 6 --max-chars 4000
run_tab "screenshot"          screenshot
run_tab "zoom"                zoom 0 0 100 100

# ---- mouse / keyboard -------------------------------------------------------
echo
echo "==> mouse / keyboard"
run_tab "left_click"          left_click 50 50
run_tab "right_click"         right_click 50 50
run_tab "double_click"        double_click 50 50
run_tab "triple_click"        triple_click 50 50
run_tab "hover"               hover 50 50
run_tab "left_click_drag"     left_click_drag 50 50 100 100
run_tab "type"                type "hello"
run_tab "key"                 key "Escape"
run_tab "scroll"              scroll 100 100 --direction down --amount 1
run_tab "wait"                wait 0.1

# scroll_to / form_input / upload need a ref — pull one from read_page.
REF=$("$SD" --tab "$TAB" read_page --filter interactive --depth 8 --max-chars 6000 2>/dev/null \
  | grep -oE 'ref_[0-9]+' | head -1)
echo "    using ref=$REF for scroll_to/form_input"
if [ -n "$REF" ]; then
  run_tab "scroll_to"         scroll_to --ref "$REF"
  run_tab "form_input"        form_input --ref "$REF" --value "x" --string
fi

# upload needs an image-id — capture a screenshot first to mint one.
SHOT_OUT=$("$SD" --tab "$TAB" screenshot --output "$OUT/" 2>&1 || true)
SHOT_FILE=$(ls "$OUT"/*.jpg "$OUT"/*.png 2>/dev/null | head -1)
IMG_ID=""
[ -n "$SHOT_FILE" ] && IMG_ID=$(basename "$SHOT_FILE" | sed -E 's/\.(jpg|jpeg|png)$//')
if [ -n "$REF" ] && [ -n "$IMG_ID" ]; then
  run_tab "upload_image"      upload_image --ref "$REF" --image-id "$IMG_ID" --filename "smoke.png"
fi

# ---- observability ----------------------------------------------------------
echo
echo "==> observability"
run_tab "console"             console --pattern '.*' --limit 5
run_tab "console_only_errors" console --only-errors --limit 5
run_tab "network"             network --limit 5
run_tab "network_pattern"     network --url-pattern '/api/' --limit 5

# ---- window / nav -----------------------------------------------------------
echo
echo "==> window / nav"
run_tab "resize"              resize 1024 768

# ---- shortcuts / gif --------------------------------------------------------
echo
echo "==> shortcuts / gif"
run_tab "shortcuts_list"      shortcuts list
run_tab "gif_start"           gif start
run_tab "gif_stop"            gif stop
run_tab "gif_clear"           gif clear

# ---- summary ----------------------------------------------------------------
echo
echo "==> summary: $PASS passed, $FAIL failed (artifacts in $OUT)"
if [ "$FAIL" -gt 0 ]; then
  printf '  failed:\n'
  for n in "${FAILED_NAMES[@]}"; do printf '    - %s\n' "$n"; done
  exit 1
fi
exit 0
