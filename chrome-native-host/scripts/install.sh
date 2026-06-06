#!/bin/bash
set -euo pipefail

HOST_NAME="com.me.superduck_browser_extension"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOST_BINARY="$PROJECT_DIR/build/chrome-native-host"
MCP_BINARY="$PROJECT_DIR/build/chrome-mcp-server"

# Extension IDs for different browsers
# Chrome Store ID: komnjkkihimgafgblijcchlgeiogpjgi
# Edge Add-ons ID: (to be determined after publishing)
CHROME_EXTENSION_ID="${CHROME_EXTENSION_ID:-komnjkkihimgafgblijcchlgeiogpjgi}"
EDGE_EXTENSION_ID="${EDGE_EXTENSION_ID:-}"  # Leave empty until published

# Detect OS and set manifest directories for all supported browsers
MANIFEST_DIRS=()
case "$(uname -s)" in
  Darwin)
    MANIFEST_DIRS+=("chrome:$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts")
    if [ -n "$EDGE_EXTENSION_ID" ]; then
      MANIFEST_DIRS+=("edge:$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts")
    fi
    MANIFEST_DIRS+=("brave:$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts")
    CLAUDE_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
    ;;
  Linux)
    MANIFEST_DIRS+=("chrome:$HOME/.config/google-chrome/NativeMessagingHosts")
    if [ -n "$EDGE_EXTENSION_ID" ]; then
      MANIFEST_DIRS+=("edge:$HOME/.config/microsoft-edge/NativeMessagingHosts")
    fi
    MANIFEST_DIRS+=("brave:$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts")
    CLAUDE_CONFIG="$HOME/.config/Claude/claude_desktop_config.json"
    ;;
  *)
    echo "Unsupported OS: $(uname -s)"
    exit 1
    ;;
esac

echo "=== Building binaries ==="
cd "$SCRIPT_DIR/.."
make all

echo ""
echo "=== Installing Native Host ==="

# Validate Chromium extension ID format (32 lowercase letters a-p)
validate_extension_id() {
  local id="$1"
  if ! [[ "$id" =~ ^[a-p]{32}$ ]]; then
    echo "  ❌ Invalid extension ID format: $id"
    echo "     Expected: 32 lowercase letters (a-p), e.g., komnjkkihimgafgblijcchlgeiogpjgi"
    return 1
  fi
  return 0
}

for ENTRY in "${MANIFEST_DIRS[@]}"; do
  BROWSER="${ENTRY%%:*}"
  MANIFEST_DIR="${ENTRY#*:}"

  # Determine extension ID based on browser
  case "$BROWSER" in
    chrome|brave)
      EXTENSION_ID="$CHROME_EXTENSION_ID"
      ;;
    edge)
      EXTENSION_ID="$EDGE_EXTENSION_ID"
      ;;
    *)
      echo "  ⚠️  Unknown browser: $BROWSER, skipping..."
      continue
      ;;
  esac

  if [ -z "$EXTENSION_ID" ]; then
    echo "  ⏭️  Skipping $BROWSER (no extension ID configured)"
    continue
  fi

  if ! validate_extension_id "$EXTENSION_ID"; then
    echo "  ⏭️  Skipping $BROWSER"
    continue
  fi

  mkdir -p "$MANIFEST_DIR"
  MANIFEST_PATH="$MANIFEST_DIR/$HOST_NAME.json"
  cat > "$MANIFEST_PATH" <<EOF
{
  "name": "$HOST_NAME",
  "description": "SuperDuck Browser Extension Native Host",
  "path": "$HOST_BINARY",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXTENSION_ID/"]
}
EOF
  echo "  ✓ $BROWSER: $MANIFEST_PATH"
  echo "    Extension ID: $EXTENSION_ID"
done

echo ""
echo "=== MCP Server Configuration ==="
echo "1. Start the Native Host:"
echo "   ./build/chrome-native-host"
echo ""
echo "   (Dual channel mode: stdio + UDS will start automatically)"
echo ""
echo "2. Add the following to your Claude Desktop config:"
echo ""
echo "File: $CLAUDE_CONFIG"
echo ""
echo '{'
echo '  "mcpServers": {'
echo '    "chrome": {'
echo "      \"command\": \"$MCP_BINARY\""
echo '    }'
echo '  }'
echo '}'
echo ""
echo "=== Environment Variables ==="
echo "To customize extension IDs, set these before running install.sh:"
echo ""
echo "  export CHROME_EXTENSION_ID=\"your-chrome-extension-id\""
echo "  export EDGE_EXTENSION_ID=\"your-edge-extension-id\""
echo ""
echo "Installation complete!"
