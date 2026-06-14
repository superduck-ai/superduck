#!/bin/bash

# Web Scraping Template
# Extract data from a website and save to file

set -e

if [ $# -lt 2 ]; then
  echo "Usage: $0 <url> <selector> [output_file]"
  echo ""
  echo "Examples:"
  echo "  $0 https://news.ycombinator.com '.titleline a' hn_titles.txt"
  echo "  $0 https://example.com 'p' paragraphs.txt"
  exit 1
fi

URL="$1"
SELECTOR="$2"
OUTPUT_FILE="${3:-output.txt}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Extracting data with selector: $SELECTOR"
node "$SKILL_DIR/scripts/extract-data.mjs" "$URL" "$SELECTOR" --output "$OUTPUT_FILE"

echo "Data extracted to: $OUTPUT_FILE"
echo "Preview:"
head -20 "$OUTPUT_FILE"
