#!/bin/bash

# Screenshot Comparison Template
# Take screenshots of multiple URLs for comparison

set -e

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

# Create tab once
echo "Creating tab..."
TAB_OUTPUT=$(superduck tab_group new)
TAB_ID=$(echo "$TAB_OUTPUT" | grep -o 'Tab ID: [0-9]*' | grep -o '[0-9]*')

if [ -z "$TAB_ID" ]; then
  echo "Error: Failed to create tab"
  exit 1
fi

echo "Using tab ID: $TAB_ID"

INDEX=1

for URL in "$@"; do
  echo ""
  echo "[$INDEX] Capturing $URL..."

  # Extract domain for filename
  DOMAIN=$(echo "$URL" | sed -E 's|https?://||' | sed 's|/.*||' | sed 's|:|_|g')
  OUTPUT_FILE="$OUTPUT_DIR/${INDEX}_${DOMAIN}.jpg"

  # Navigate and capture
  superduck --tab "$TAB_ID" navigate "$URL"
  superduck --tab "$TAB_ID" context
  superduck --tab "$TAB_ID" screenshot --output "$OUTPUT_FILE"

  echo "Saved: $OUTPUT_FILE"

  INDEX=$((INDEX + 1))
  sleep 1
done

echo ""
echo "All screenshots saved to: $OUTPUT_DIR"
ls -lh "$OUTPUT_DIR"
