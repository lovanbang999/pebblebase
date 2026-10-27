#!/bin/bash
set -e

# ==============================================================================
# Pebblebase Studio - macOS Universal Packaging Script (.app + .dmg)
# Generates Universal Binaries (Apple Silicon arm64 + Intel x86_64) packaged as
# .dmg with drag-to-Applications layout and creates portable .app.zip.
# ==============================================================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Resolve package version dynamically from env var or web/package.json
if [ -z "$VERSION" ]; then
  if command -v node &> /dev/null && [ -f "web/package.json" ]; then
    VERSION=$(node -p "require('./web/package.json').version" 2>/dev/null || echo "1.0.2")
  else
    VERSION="1.0.2"
  fi
fi
VERSION="${VERSION#v}"

APP_NAME="pebblebase"
DISPLAY_NAME="Pebblebase Studio"
BIN_DIR="build/bin"
mkdir -p "$BIN_DIR" cmd/desktop/build/bin

echo "======================================================================"
echo "  Pebblebase Studio - macOS Packaging Pipeline (v${VERSION})"
echo "======================================================================"

# 1. Prerequisite checks
if ! command -v wails &> /dev/null; then
  echo "Error: Wails CLI is not installed. Run: go install github.com/wailsapp/wails/v2/cmd/wails@latest"
  exit 1
fi

# 2. Build Web Frontend if needed
if [ "$1" != "--no-frontend" ]; then
  echo "Building frontend web assets..."
  (cd web && yarn install --frozen-lockfile && yarn build)
fi

# 3. Synchronize assets to cmd/desktop/build
cp -f build/appicon.png cmd/desktop/build/appicon.png 2>/dev/null || true

# 4. Build Universal Binary (Apple Silicon arm64 + Intel x86_64)
echo "Building macOS Universal Binary with Wails..."
wails build -platform darwin/universal -clean -skipbindings -ldflags "-s -w -X pebblebase/internal/app.Version=${VERSION}"

# Locate compiled .app bundle
APP_SRC=""
for cand in "cmd/desktop/build/bin/pebblebase.app" "build/bin/pebblebase.app"; do
  if [ -d "$cand" ]; then
    APP_SRC="$cand"
    break
  fi
done

if [ -z "$APP_SRC" ]; then
  APP_SRC=$(find cmd/desktop build -name "pebblebase.app" -type d 2>/dev/null | head -n 1)
fi

if [ -z "$APP_SRC" ] || [ ! -d "$APP_SRC" ]; then
  echo "Error: Failed to locate compiled pebblebase.app bundle."
  exit 1
fi

# Copy app to build/bin
cp -rf "$APP_SRC" "$BIN_DIR/Pebblebase.app"
cp -rf "$APP_SRC" "$BIN_DIR/pebblebase.app"
echo "macOS Application bundle ready at: $BIN_DIR/Pebblebase.app"

# 5. Create Portable .app.zip
echo "Creating portable zip archive (pebblebase-darwin-universal.app.zip)..."
(
  cd "$BIN_DIR"
  rm -f "pebblebase-darwin-universal.app.zip" "pebblebase_${VERSION}_darwin_universal.app.zip"
  ditto -c -k --sequesterRsrc --keepParent "Pebblebase.app" "pebblebase-darwin-universal.app.zip"
  cp -f "pebblebase-darwin-universal.app.zip" "pebblebase_${VERSION}_darwin_universal.app.zip"
  if command -v shasum &> /dev/null; then
    shasum -a 256 "pebblebase-darwin-universal.app.zip" > "pebblebase-darwin-universal.app.zip.sha256"
  fi
)

# 6. Create .dmg with drag-to-Applications layout
DMG_NAME="pebblebase_${VERSION}_darwin_universal.dmg"
DMG_LATEST="pebblebase-darwin-universal.dmg"
DMG_PATH="$BIN_DIR/$DMG_NAME"
rm -f "$DMG_PATH" "$BIN_DIR/$DMG_LATEST"

echo "Creating macOS .dmg installer with drag-to-Applications layout..."
if command -v create-dmg &> /dev/null; then
  echo "Using create-dmg utility..."
  create-dmg \
    --volname "$DISPLAY_NAME" \
    --volicon "build/appicon.png" \
    --window-pos 200 120 \
    --window-size 600 400 \
    --icon-size 100 \
    --icon "Pebblebase.app" 150 190 \
    --hide-extension "Pebblebase.app" \
    --app-drop-link 450 190 \
    --no-internet-enable \
    "$DMG_PATH" \
    "$BIN_DIR/Pebblebase.app" || {
      echo "create-dmg exited with status $?, checking output or falling back to hdiutil..."
    }
fi

# Fallback to native hdiutil if create-dmg was absent or failed
if [ ! -f "$DMG_PATH" ]; then
  echo "Using native hdiutil to construct .dmg with /Applications symlink..."
  STAGING_DIR=$(mktemp -d /tmp/pebblebase_dmg.XXXXXX)
  cp -R "$BIN_DIR/Pebblebase.app" "$STAGING_DIR/"
  ln -s /Applications "$STAGING_DIR/Applications"
  hdiutil create \
    -volname "$DISPLAY_NAME" \
    -srcfolder "$STAGING_DIR" \
    -ov \
    -format UDZO \
    "$DMG_PATH"
  rm -rf "$STAGING_DIR"
fi

if [ -f "$DMG_PATH" ]; then
  cp -f "$DMG_PATH" "$BIN_DIR/$DMG_LATEST"
  echo "Generated macOS DMG: $DMG_PATH and $BIN_DIR/$DMG_LATEST"
  (
    cd "$BIN_DIR"
    if command -v shasum &> /dev/null; then
      shasum -a 256 "$DMG_NAME" > "${DMG_NAME}.sha256"
      shasum -a 256 "$DMG_LATEST" > "${DMG_LATEST}.sha256"
    fi
  )
else
  echo "Warning: DMG creation failed."
fi

echo "macOS packaging complete! Output files in $BIN_DIR/:"
ls -lh "$BIN_DIR"/pebblebase*darwin* 2>/dev/null || true
