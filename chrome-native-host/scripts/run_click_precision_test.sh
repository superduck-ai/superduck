#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DIR="$ROOT_DIR/scripts"
SD="${SD_BIN:-$ROOT_DIR/superduck}"
PAGE_PORT="${SD_CLICK_TEST_PORT:-8787}"
PAGE_URL="${SD_CLICK_TEST_URL:-http://127.0.0.1:${PAGE_PORT}/}"
OUT_DIR="${SD_CLICK_TEST_OUT:-/tmp/sd_click_precision_test}"
WINDOW_WIDTH="${SD_CLICK_TEST_WIDTH:-1440}"
WINDOW_HEIGHT="${SD_CLICK_TEST_HEIGHT:-1200}"
NAV_SETTLE_SECONDS="${SD_CLICK_TEST_NAV_SETTLE_SECONDS:-2.5}"
STEP_SETTLE_SECONDS="${SD_CLICK_TEST_STEP_SETTLE_SECONDS:-0.25}"

TARGETS=(
  "base-top-left"
  "base-center"
  "base-center-right"
  "grid-a-r1-c1"
  "grid-a-r2-c4"
  "grid-a-r4-c6"
  "grid-b-r1-c1"
  "grid-b-r3-c4"
  "grid-b-r5-c8"
  "grid-c-r1-c1"
  "grid-c-r3-c5"
  "grid-c-r6-c10"
  "strip-horizontal-1"
  "strip-horizontal-7"
  "strip-horizontal-14"
  "strip-vertical-1"
  "strip-vertical-7"
  "strip-vertical-14"
  "edge-top-left"
  "edge-mid-right"
  "edge-bottom-center"
)

SERVER_PID=""
TAB=""
FAIL_COUNT=0
RESULTS_TSV="$OUT_DIR/results.tsv"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}

page_ready() {
  curl -fsS "$PAGE_URL" 2>/dev/null | grep -q "SuperDuck 点击精度测试页"
}

ensure_page_server() {
  for _ in $(seq 1 5); do
    if page_ready; then
      echo "==> using existing click test page: $PAGE_URL"
      return
    fi
    sleep 0.2
  done

  if [ -n "${SD_CLICK_TEST_URL:-}" ]; then
    echo "click test page is not reachable: $PAGE_URL" >&2
    exit 1
  fi

  echo "==> starting click test page on $PAGE_URL"
  mkdir -p "$OUT_DIR"
  "$SCRIPT_DIR/start-click-test.sh" ":$PAGE_PORT" >"$OUT_DIR/server.log" 2>&1 &
  SERVER_PID=$!

  for _ in $(seq 1 40); do
    if page_ready; then
      return
    fi
    sleep 0.25
  done

  echo "failed to start click test page: $PAGE_URL" >&2
  if [ -f "$OUT_DIR/server.log" ]; then
    sed -n '1,120p' "$OUT_DIR/server.log" >&2
  fi
  exit 1
}

run_sd() {
  "$SD" "$@"
}

run_tab() {
  "$SD" --tab "$TAB" "$@"
}

js_eval() {
  local script="$1"
  local raw
  raw="$(printf '%s' "$script" | run_tab exec --stdin)"
  printf '%s\n' "$raw" | sed -n '/./{p;q;}'
}

json_string() {
  jq -n --arg value "$1" '$value'
}

wait_for_page_runtime() {
  for _ in $(seq 1 40); do
    if js_eval 'Boolean(window.superduckClickTest && window.superduckClickTest.getCompactStateSnapshot)' 2>/dev/null | grep -q '^true$'; then
      return
    fi
    sleep 0.25
  done
  echo "page runtime helper is not ready" >&2
  exit 1
}

scroll_target_into_view() {
  local target="$1"
  local target_json
  target_json="$(json_string "$target")"
  js_eval "$(cat <<EOF
(() => {
  const info = window.superduckClickTest.scrollTargetIntoView($target_json);
  return JSON.stringify(info);
})()
EOF
)"
}

get_target_center() {
  local target="$1"
  local target_json
  target_json="$(json_string "$target")"
  js_eval "$(cat <<EOF
(() => JSON.stringify(window.superduckClickTest.getTargetCenter($target_json)))()
EOF
)"
}

get_state_snapshot() {
  js_eval 'JSON.stringify(window.superduckClickTest.getCompactStateSnapshot())'
}

reset_page_state() {
  js_eval 'window.superduckClickTest.reset(); "ok"' >/dev/null
}

print_failure_artifacts() {
  local target="$1"
  run_tab screenshot --output "$OUT_DIR/fail-${target}" >/dev/null 2>&1 || true
}

click_target_and_assert() {
  local target="$1"
  local before_state before_hit before_miss
  local center_json x y
  local click_output click_status after_state actual_target actual_hit actual_miss
  local result expected_hit expected_miss last_delta last_margin last_judge

  before_state="$(get_state_snapshot)"
  before_hit="$(jq -r '.hitCount' <<<"$before_state")"
  before_miss="$(jq -r '.missCount' <<<"$before_state")"

  scroll_target_into_view "$target" >/dev/null
  sleep "$STEP_SETTLE_SECONDS"

  center_json="$(get_target_center "$target")"
  x="$(jq -r '.x' <<<"$center_json")"
  y="$(jq -r '.y' <<<"$center_json")"

  click_output=""
  if click_output="$(run_tab left_click "$x" "$y" 2>&1)"; then
    click_status=0
  else
    click_status=$?
  fi

  sleep "$STEP_SETTLE_SECONDS"
  after_state="$(get_state_snapshot)"
  actual_target="$(jq -r '.lastTarget' <<<"$after_state")"
  actual_hit="$(jq -r '.hitCount' <<<"$after_state")"
  actual_miss="$(jq -r '.missCount' <<<"$after_state")"
  last_delta="$(jq -r '.lastDelta' <<<"$after_state")"
  last_margin="$(jq -r '.lastMargin' <<<"$after_state")"
  last_judge="$(jq -r '.lastJudge' <<<"$after_state")"
  expected_hit=$((before_hit + 1))
  expected_miss="$before_miss"

  if [ "$click_status" -eq 0 ] && [ "$actual_target" = "$target" ] && [ "$actual_hit" -eq "$expected_hit" ] && [ "$actual_miss" -eq "$expected_miss" ]; then
    result="PASS"
    echo "PASS $target @ ($x,$y) | $last_delta | $last_margin | $last_judge"
  else
    result="FAIL"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "FAIL $target @ ($x,$y)" >&2
    echo "  cli_status: $click_status" >&2
    echo "  cli_output: ${click_output:-<empty>}" >&2
    echo "  expected lastTarget=$target hitCount=$expected_hit missCount=$expected_miss" >&2
    echo "  actual   lastTarget=$actual_target hitCount=$actual_hit missCount=$actual_miss" >&2
    echo "  detail   $last_delta | $last_margin | $last_judge" >&2
    print_failure_artifacts "$target"
  fi

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$target" "$x" "$y" "$result" "$actual_target" "$actual_hit" "$actual_miss" "$last_delta" >>"$RESULTS_TSV"
}

trap cleanup EXIT

require_cmd curl
require_cmd jq

if [ ! -x "$SD" ]; then
  echo "superduck binary not found or not executable: $SD" >&2
  echo "run 'make superduck' in chrome-native-host first" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

ensure_page_server

echo "==> ensure MCP tab group exists"
run_sd tab_group list --create-if-empty >/dev/null

echo "==> create a fresh tab in the MCP group"
TAB="$(run_sd tab_group new | sed -n 's/.*Tab ID: *\([0-9][0-9]*\).*/\1/p' | head -1)"
if [ -z "$TAB" ]; then
  echo "could not resolve new tabId from 'tab_group new' output" >&2
  exit 1
fi
echo "    tabId=$TAB"

echo "==> navigate tab to $PAGE_URL"
run_tab navigate "$PAGE_URL" >/dev/null
sleep "$NAV_SETTLE_SECONDS"

echo "==> resize browser window to ${WINDOW_WIDTH}x${WINDOW_HEIGHT}"
if ! run_tab resize "$WINDOW_WIDTH" "$WINDOW_HEIGHT" >/dev/null 2>&1; then
  echo "resize failed; continuing with current browser size" >&2
fi
sleep 0.5

wait_for_page_runtime

echo "==> verify page title"
PAGE_TITLE="$(js_eval 'document.title')"
if [ "$PAGE_TITLE" != "SuperDuck 点击精度测试页" ]; then
  echo "unexpected page title: $PAGE_TITLE" >&2
  exit 1
fi

echo "==> reset page state"
reset_page_state

printf 'target\tx\ty\tresult\tactual_target\thit_count\tmiss_count\tlast_delta\n' >"$RESULTS_TSV"

echo "==> initial screenshot"
run_tab screenshot --output "$OUT_DIR/initial" >/dev/null 2>&1 || true

echo "==> run click precision regression"
for target in "${TARGETS[@]}"; do
  click_target_and_assert "$target"
done

echo "==> capture final state"
FINAL_STATE="$(get_state_snapshot)"
printf '%s\n' "$FINAL_STATE" | jq '.' >"$OUT_DIR/final-state.json"
run_tab screenshot --output "$OUT_DIR/final" >/dev/null 2>&1 || true

PASS_COUNT=$(( ${#TARGETS[@]} - FAIL_COUNT ))
echo
echo "summary: ${PASS_COUNT}/${#TARGETS[@]} targets passed"
echo "artifact dir: $OUT_DIR"
echo "key files:"
find "$OUT_DIR" -maxdepth 1 -type f \
  \( -name 'results.tsv' -o -name 'final-state.json' -o -name 'initial.*' -o -name 'final.*' \) \
  | sort | sed 's/^/  /'

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
