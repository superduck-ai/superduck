#!/usr/bin/env bash
set -euo pipefail

# Bumps the superduck CLI version across all locations in the monorepo.
#
# Usage:
#   scripts/bump-version.sh 0.2.5
#
# This updates:
#   1. chrome-native-host/cmd/superduck/main.go       (var version default)
#   2. npm/package.json                               (package version + optionalDependencies)
#   3. npm/packages/*/package.json                    (platform package versions)

if [ $# -ne 1 ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 0.2.5"
  exit 1
fi

NEW_VERSION="$1"

if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be semver (e.g. 0.2.5), got: $NEW_VERSION"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Bumping version to $NEW_VERSION across all locations..."

# 1. Go binary default version
MAIN_GO="$REPO_ROOT/chrome-native-host/cmd/superduck/main.go"
sed -i '' "s/^var version = \".*\"/var version = \"$NEW_VERSION\"/" "$MAIN_GO"
echo "  [OK] $MAIN_GO"

# 2. npm/package.json — main package version
NPM_PKG="$REPO_ROOT/npm/package.json"
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('$NPM_PKG', 'utf8'));
  pkg.version = '$NEW_VERSION';
  for (const dep of Object.keys(pkg.optionalDependencies || {})) {
    pkg.optionalDependencies[dep] = '$NEW_VERSION';
  }
  fs.writeFileSync('$NPM_PKG', JSON.stringify(pkg, null, 2) + '\n');
"
echo "  [OK] $NPM_PKG"

# 3. Platform packages
for PKG_DIR in "$REPO_ROOT"/npm/packages/*/; do
  PKG_JSON="$PKG_DIR/package.json"
  if [ -f "$PKG_JSON" ]; then
    node -e "
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('$PKG_JSON', 'utf8'));
      pkg.version = '$NEW_VERSION';
      fs.writeFileSync('$PKG_JSON', JSON.stringify(pkg, null, 2) + '\n');
    "
    echo "  [OK] $PKG_JSON"
  fi
done

echo ""
echo "Done. All locations bumped to $NEW_VERSION."
echo ""
echo "Next steps:"
echo "  1. git add -A && git commit -m \"chore: bump CLI version to $NEW_VERSION\""
echo "  2. git tag v$NEW_VERSION"
echo "  3. git push origin main --tags"
echo "  4. CI will build release binaries with version $NEW_VERSION embedded"
echo "  5. npm publish each package (npm/packages/* then npm/)"
