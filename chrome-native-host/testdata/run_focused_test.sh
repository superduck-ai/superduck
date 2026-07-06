#!/usr/bin/env bash
# Focused tests for: form_input, upload, read_page, page_text, exec, --json mode.
# Each step prints PASS/FAIL and contributes to the final summary; non-zero exit
# if anything failed.
#
#   go run ./testdata/server -addr :8765 &
#   ./testdata/run_focused_test.sh

set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SD="$HERE/superduck"
PAGE="${SD_TEST_URL:-http://localhost:8765/}"
OUT="/tmp/sd_focused"
rm -rf "$OUT"; mkdir -p "$OUT"

PASS=0; FAIL=0
FAILED_NAMES=()

assert() {
  local name="$1"; local cond="$2"; local detail="${3:-}"
  if bash -c "$cond" >/dev/null 2>&1; then
    PASS=$((PASS+1)); printf '  PASS  %s\n' "$name"
  else
    FAIL=$((FAIL+1)); FAILED_NAMES+=("$name")
    printf '  FAIL  %s\n' "$name"
    [ -n "$detail" ] && printf '        %s\n' "$(echo "$detail" | head -3)"
  fi
}

run_capture() {
  # run_capture <outfile> <command...>
  local out="$1"; shift
  "$SD" --tab "$TAB" "$@" >"$out" 2>"$out.err" || true
}

# ---- bootstrap -------------------------------------------------------------
echo "==> ensure MCP tab group"
"$SD" tab_group list --create-if-empty >/dev/null

echo "==> create fresh tab"
TAB=$("$SD" tab_group new | sed -n 's/.*Tab ID: *\([0-9][0-9]*\).*/\1/p' | head -1)
[ -n "$TAB" ] || { echo "could not resolve tabId"; exit 1; }
echo "    tabId=$TAB"

"$SD" --tab "$TAB" navigate "$PAGE" >/dev/null
sleep 3

# strip the trailing "Tab Context: ..." preamble that most commands append.
strip_tail() {
  awk '/^$/{exit} {print}' "$1"
}

# ---- exec ------------------------------------------------------------------
echo
echo "==> exec"
run_capture "$OUT/exec_title.txt" exec 'document.title'
strip_tail "$OUT/exec_title.txt" > "$OUT/exec_title.val"
assert "exec returns page title" \
  "grep -q 'superduck CLI test page' '$OUT/exec_title.val'" \
  "$(cat "$OUT/exec_title.val")"

run_capture "$OUT/exec_count.txt" exec 'document.querySelectorAll("section").length'
strip_tail "$OUT/exec_count.txt" > "$OUT/exec_count.val"
assert "exec returns numeric expression" \
  "grep -qE '^[0-9]+\$' '$OUT/exec_count.val'" \
  "$(cat "$OUT/exec_count.val")"

# ---- page_text -------------------------------------------------------------
echo
echo "==> page_text"
run_capture "$OUT/page_text.txt" page_text
assert "page_text contains heading" \
  "grep -q 'superduck CLI test page' '$OUT/page_text.txt'"
assert "page_text contains form section text" \
  "grep -qi 'form_input target' '$OUT/page_text.txt'"

# ---- read_page -------------------------------------------------------------
echo
echo "==> read_page (interactive)"
run_capture "$OUT/read_page.txt" read_page --filter interactive --depth 12 --max-chars 8000
assert "read_page mentions a button" \
  "grep -qiE 'button|Left click' '$OUT/read_page.txt'"
assert "read_page emits ref ids" \
  "grep -qE 'ref_[0-9]+' '$OUT/read_page.txt'"

# ---- form_input -------------------------------------------------------------
echo
echo "==> form_input (resolve refs via read_page, set values, verify in DOM)"

# Parse refs from read_page output. Lines look like:
#   - textbox "Name " [ref=ref_97]
#   - spinbutton "Age " [ref=ref_98]
#   - checkbox " agree?" [checked=false, ref=ref_95]
#   - combobox "Color " [...ref=ref_99]
parse_ref() {
  # parse_ref <pattern>
  grep -E "$1" "$OUT/read_page.txt" | grep -oE 'ref_[0-9]+' | head -1
}
NAME_REF=$(parse_ref 'textbox "Name')
AGE_REF=$(parse_ref 'spinbutton "Age')
COLOR_REF=$(parse_ref 'combobox "Color')
AGREE_REF=$(parse_ref 'checkbox " *agree')
UPLOAD_REF=$(parse_ref 'Choose File')
echo "    refs: name=$NAME_REF age=$AGE_REF color=$COLOR_REF agree=$AGREE_REF upload=$UPLOAD_REF"

[ -n "$NAME_REF" ]   && "$SD" --tab "$TAB" form_input --ref "$NAME_REF"   --value "Arthur" --string >"$OUT/fi_name.txt" 2>&1 || true
[ -n "$AGE_REF" ]    && "$SD" --tab "$TAB" form_input --ref "$AGE_REF"    --value "42"     --string >"$OUT/fi_age.txt" 2>&1 || true
[ -n "$COLOR_REF" ]  && "$SD" --tab "$TAB" form_input --ref "$COLOR_REF"  --value "green"  --string >"$OUT/fi_color.txt" 2>&1 || true
[ -n "$AGREE_REF" ]  && "$SD" --tab "$TAB" form_input --ref "$AGREE_REF"  --value "true"           >"$OUT/fi_agree.txt" 2>&1 || true

# Read DOM state via separate exec calls, each a single value.
read_dom() {
  "$SD" --tab "$TAB" exec "$1" 2>/dev/null | awk '/^$/{exit} {print}'
}
NAME_VAL=$(read_dom 'document.querySelector("[data-testid=form-name]").value')
AGE_VAL=$(read_dom  'document.querySelector("[data-testid=form-age]").value')
COLOR_VAL=$(read_dom 'document.querySelector("[data-testid=form-color]").value')
AGREE_VAL=$(read_dom 'String(document.querySelector("[data-testid=form-agree]").checked)')
echo "    DOM state: name=$NAME_VAL age=$AGE_VAL color=$COLOR_VAL agree=$AGREE_VAL"

assert "form_input sets text field"     "[ '$NAME_VAL'  = 'Arthur' ]" "got '$NAME_VAL'"
assert "form_input sets number field"   "[ '$AGE_VAL'   = '42'     ]" "got '$AGE_VAL'"
assert "form_input sets select option"  "[ '$COLOR_VAL' = 'green'  ]" "got '$COLOR_VAL'"
assert "form_input toggles checkbox"    "[ '$AGREE_VAL' = 'true'   ]" "got '$AGREE_VAL'"

# ---- upload ----------------------------------------------------------------
echo
echo "==> upload (upload_image via --ref + image-id)"
SHOT_OUT=$("$SD" --tab "$TAB" screenshot --output "$OUT/" 2>&1 || true)
echo "$SHOT_OUT" >"$OUT/screenshot.txt"
SHOT_FILE=$(ls "$OUT"/*.jpg "$OUT"/*.png 2>/dev/null | head -1)
# image-id = filename without extension (matches what the extension's gallery uses).
IMG_ID=""
[ -n "$SHOT_FILE" ] && IMG_ID=$(basename "$SHOT_FILE" | sed -E 's/\.(jpg|jpeg|png)$//')
echo "    upload ref=$UPLOAD_REF, shot=$SHOT_FILE, image-id=$IMG_ID"

if [ -n "$UPLOAD_REF" ] && [ -n "$IMG_ID" ]; then
  "$SD" --tab "$TAB" upload --ref "$UPLOAD_REF" --image-id "$IMG_ID" --filename "smoke.png" >"$OUT/upload.txt" 2>&1 || true
  UPLOAD_DOM=$(read_dom 'document.getElementById("uploadStatus").textContent')
  echo "    DOM uploadStatus: $UPLOAD_DOM"
  assert "upload --ref attaches file" \
    "echo '$UPLOAD_DOM' | grep -qE 'smoke|\\.png|[0-9]+B'" \
    "got '$UPLOAD_DOM'"
else
  FAIL=$((FAIL+1)); FAILED_NAMES+=("upload --ref attaches file (skipped: missing ref or image-id)")
  printf '  FAIL  upload --ref attaches file (skipped: missing ref or image-id)\n'
fi

# ---- --json mode -----------------------------------------------------------
echo
echo "==> --json mode"
"$SD" --json tab_group list >"$OUT/json_tab_group.json" 2>&1 || true
assert "tab_group list --json is valid JSON" \
  "python3 -c 'import json,sys;json.load(open(\"$OUT/json_tab_group.json\"))' 2>/dev/null"

"$SD" --json tabs >"$OUT/json_tabs.json" 2>&1 || true
assert "tabs --json is valid JSON" \
  "python3 -c 'import json,sys;json.load(open(\"$OUT/json_tabs.json\"))' 2>/dev/null"

"$SD" --json --tab "$TAB" exec 'document.title' >"$OUT/json_exec.json" 2>&1 || true
assert "exec --json is valid JSON" \
  "python3 -c 'import json,sys;json.load(open(\"$OUT/json_exec.json\"))' 2>/dev/null"

"$SD" --json --tab "$TAB" page_text >"$OUT/json_page_text.json" 2>&1 || true
assert "page_text --json is valid JSON" \
  "python3 -c 'import json,sys;json.load(open(\"$OUT/json_page_text.json\"))' 2>/dev/null"

"$SD" --json --tab "$TAB" read_page --filter interactive --depth 6 --max-chars 4000 >"$OUT/json_read_page.json" 2>&1 || true
assert "read_page --json is valid JSON" \
  "python3 -c 'import json,sys;json.load(open(\"$OUT/json_read_page.json\"))' 2>/dev/null"

# ---- summary ---------------------------------------------------------------
echo
echo "==> summary: $PASS passed, $FAIL failed (artifacts in $OUT)"
if [ "$FAIL" -gt 0 ]; then
  printf '  failed:\n'
  for n in "${FAILED_NAMES[@]}"; do printf '    - %s\n' "$n"; done
  exit 1
fi
exit 0
