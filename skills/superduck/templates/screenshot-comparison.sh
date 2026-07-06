#!/bin/bash

# Screenshot Comparison Template
# Take screenshots of multiple URLs for comparison

set -euo pipefail

command -v jq >/dev/null 2>&1 || {
  echo "Error: jq is required but not installed." >&2
  exit 1
}

if [ $# -lt 2 ]; then
  echo "Usage: $0 <output_dir> <url1> [url2] [url3] ..."
  echo ""
  echo "Example:"
  echo "  $0 /tmp/screenshots https://staging.example.com https://prod.example.com"
  exit 1
fi

OUTPUT_DIR="$1"
shift

mkdir -p "$OUTPUT_DIR"

SID=$(superduck session new)
TAB_ID=""

cleanup() {
  if [ -n "$TAB_ID" ]; then
    superduck --session "$SID" tab_group finalize >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# Reuse one tab in this task's session group, creating the group only if needed.
echo "Resolving session tab..."
RAW_TAB_CONTEXT=$(superduck --session "$SID" --json tab_group list --create-if-empty --name "Screenshot comparison")
TAB_ID=$(printf '%s\n' "$RAW_TAB_CONTEXT" | jq -r '.tabContext.currentTabId // ""')

if [ -z "$TAB_ID" ]; then
  echo "Error: Failed to resolve tab. Raw payload:"
  printf '%s\n' "$RAW_TAB_CONTEXT"
  exit 1
fi

echo "Using session: $SID"
echo "Using tab ID: $TAB_ID"

INDEX=1

for URL in "$@"; do
  echo ""
  echo "[$INDEX] Capturing $URL..."

  # Extract domain for filename
  DOMAIN=$(echo "$URL" | sed -E 's|https?://||' | sed 's|/.*||' | sed 's|:|_|g')
  OUTPUT_FILE="$OUTPUT_DIR/${INDEX}_${DOMAIN}.jpg"

  # Navigate and capture
  superduck --session "$SID" --tab "$TAB_ID" navigate "$URL"
  superduck --session "$SID" --tab "$TAB_ID" context
  superduck --session "$SID" --tab "$TAB_ID" screenshot --output "$OUTPUT_FILE"

  echo "Saved: $OUTPUT_FILE"

  INDEX=$((INDEX + 1))
  sleep 1
done

echo ""
echo "All screenshots saved to: $OUTPUT_DIR"
ls -lh "$OUTPUT_DIR"
