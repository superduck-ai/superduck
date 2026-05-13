#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ADDR="${1:-${SD_CLICK_TEST_ADDR:-:8787}}"
PAGE="$SCRIPT_DIR/click-precision-test.html"

echo "serving click precision test page on http://localhost${ADDR}"
echo "page: $PAGE"

exec go run "$ROOT_DIR/testdata/server/main.go" -addr "$ADDR" -page "$PAGE"
