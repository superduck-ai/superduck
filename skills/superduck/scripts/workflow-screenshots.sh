#!/bin/bash

# Workflow Screenshot Capture
# Captures screenshots at each step of a browser workflow

set -e

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

# Create tab
echo "Creating tab..."
TAB_OUTPUT=$(superduck tab_group new)
TAB_ID=$(echo "$TAB_OUTPUT" | grep -o 'Tab ID: [0-9]*' | grep -o '[0-9]*')

if [ -z "$TAB_ID" ]; then
  echo "Error: Failed to create tab"
  exit 1
fi

echo "Using tab ID: $TAB_ID"

# Navigate to URL
echo "Navigating to $URL..."
superduck --tab "$TAB_ID" navigate "$URL"
superduck --tab "$TAB_ID" context
superduck --tab "$TAB_ID" screenshot --output "$OUTPUT_DIR/01-initial.jpg"

STEP_NUM=2

# Process each step
for STEP in "$@"; do
  echo "Executing step: $STEP"

  if [[ "$STEP" == search:* ]]; then
    QUERY="${STEP#search:}"
    echo "Searching for: $QUERY"
    superduck --tab "$TAB_ID" type "$QUERY"
    superduck --tab "$TAB_ID" key Enter
    sleep 2

  elif [[ "$STEP" == click:* ]]; then
    SELECTOR="${STEP#click:}"
    echo "Clicking: $SELECTOR"
    # This is simplified - real implementation would find coordinates
    superduck --tab "$TAB_ID" left_click 300 300
    sleep 1

  elif [[ "$STEP" == wait:* ]]; then
    SECONDS="${STEP#wait:}"
    echo "Waiting ${SECONDS}s..."
    sleep "$SECONDS"
  fi

  # Capture screenshot after each step
  STEP_FILE=$(printf "%s/%02d-step.jpg" "$OUTPUT_DIR" "$STEP_NUM")
  superduck --tab "$TAB_ID" screenshot --output "$STEP_FILE"
  echo "Screenshot saved: $STEP_FILE"

  STEP_NUM=$((STEP_NUM + 1))
done

echo "Workflow complete. Screenshots saved to $OUTPUT_DIR"
