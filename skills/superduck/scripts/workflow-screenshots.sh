#!/bin/bash

# Workflow Screenshot Capture
# Captures screenshots at each step of a browser workflow

set -euo pipefail

command -v jq >/dev/null 2>&1 || {
  echo "Error: jq is required but not installed." >&2
  exit 1
}

if [ $# -lt 2 ]; then
  echo "Usage: $0 <output_dir> <url> [steps...]"
  echo ""
  echo "Example:"
  echo "  $0 /tmp/workflow https://wikipedia.org 'search:AI' 'click:#search-button'"
  exit 1
fi

OUTPUT_DIR="$1"
URL="$2"
shift 2

mkdir -p "$OUTPUT_DIR"

SID=$(superduck session new)
TAB_ID=""

cleanup() {
  if [ -n "$TAB_ID" ]; then
    superduck --session "$SID" tab_group finalize >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# Reuse this task's session tab group, creating it only if needed.
echo "Resolving session tab..."
RAW_TAB_CONTEXT=$(superduck --session "$SID" --json tab_group list --create-if-empty --name "Workflow screenshots")
TAB_ID=$(printf '%s\n' "$RAW_TAB_CONTEXT" | jq -r '.tabContext.currentTabId // ""')

if [ -z "$TAB_ID" ]; then
  echo "Error: Failed to resolve tab. Raw payload:"
  printf '%s\n' "$RAW_TAB_CONTEXT"
  exit 1
fi

echo "Using session: $SID"
echo "Using tab ID: $TAB_ID"

# Navigate to URL
echo "Navigating to $URL..."
superduck --session "$SID" --tab "$TAB_ID" navigate "$URL"
superduck --session "$SID" --tab "$TAB_ID" context
superduck --session "$SID" --tab "$TAB_ID" screenshot --output "$OUTPUT_DIR/01-initial.jpg"

STEP_NUM=2

# Process each step
for STEP in "$@"; do
  echo "Executing step: $STEP"

  if [[ "$STEP" == search:* ]]; then
    QUERY="${STEP#search:}"
    echo "Searching for: $QUERY"
    superduck --session "$SID" --tab "$TAB_ID" type "$QUERY"
    superduck --session "$SID" --tab "$TAB_ID" key Enter
    sleep 2

  elif [[ "$STEP" == click:* ]]; then
    SELECTOR="${STEP#click:}"
    echo "Clicking: $SELECTOR"
    # This is simplified - real implementation would find coordinates
    superduck --session "$SID" --tab "$TAB_ID" left_click 300 300
    sleep 1

  elif [[ "$STEP" == wait:* ]]; then
    SECONDS="${STEP#wait:}"
    echo "Waiting ${SECONDS}s..."
    sleep "$SECONDS"
  fi

  # Capture screenshot after each step
  STEP_FILE=$(printf "%s/%02d-step.jpg" "$OUTPUT_DIR" "$STEP_NUM")
  superduck --session "$SID" --tab "$TAB_ID" screenshot --output "$STEP_FILE"
  echo "Screenshot saved: $STEP_FILE"

  STEP_NUM=$((STEP_NUM + 1))
done

echo "Workflow complete. Screenshots saved to $OUTPUT_DIR"
