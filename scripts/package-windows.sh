#!/bin/bash
set -e

# ==============================================================================
# Pebblebase Studio - Windows Cross-Compilation & Packaging Script
# Cross-compiles Pebblebase Studio for 64-bit Windows (.exe + installer) from Linux
# ==============================================================================

VERSION="0.1.1"
ARCH="amd64"
APP_NAME="pebblebase"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "======================================================================"
echo "  Pebblebase Studio - Windows Cross-Compilation Pipeline (v${VERSION})"
echo "======================================================================"

# ------------------------------------------------------------------------------
# 1. Prerequisite Checks
# ------------------------------------------------------------------------------
MISSING_DEPS=()

if ! command -v wails &> /dev/null; then
  MISSING_DEPS+=("wails (run: go install github.com/wailsapp/wails/v2/cmd/wails@latest)")
fi

if ! command -v x86_64-w64-mingw32-gcc &> /dev/null; then
  MISSING_DEPS+=("gcc-mingw-w64-x86-64 (run: sudo apt install -y gcc-mingw-w64-x86-64)")
fi

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
  echo ""
  echo "Error: Missing required cross-compilation dependencies:"
  for dep in "${MISSING_DEPS[@]}"; do
    echo "   - $dep"
  done
  echo ""
  echo "Please install them and re-run this script:"
  echo "  sudo apt update && sudo apt install -y gcc-mingw-w64-x86-64 nsis"
  exit 1
fi

HAS_NSIS=false
if command -v makensis &> /dev/null; then
  HAS_NSIS=true
else
  echo "Notice: NSIS (makensis) is not installed. Portable .exe will be built, but setup installer requires: sudo apt install -y nsis"
fi

# ------------------------------------------------------------------------------
# 2. Verify Windows Build Assets
# ------------------------------------------------------------------------------
mkdir -p build/windows/installer
mkdir -p build/bin
mkdir -p cmd/desktop/build

if [ ! -f "build/windows/icon.ico" ]; then
  echo "Generating build/windows/icon.ico from web/public/favicon.svg..."
  python3 - << 'PYEOF'
import os
import gi
gi.require_version('Rsvg', '2.0')
from gi.repository import Rsvg
import cairo
from PIL import Image

svg_path = "web/public/favicon.svg"
out_dir = "build/windows"
os.makedirs(out_dir, exist_ok=True)

handle = Rsvg.Handle.new_from_file(svg_path)
sizes = [16, 32, 48, 64, 128, 256]
images = []

for sz in sizes:
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, sz, sz)
    ctx = cairo.Context(surface)
    ctx.scale(sz / 128.0, sz / 128.0)
    handle.render_cairo(ctx)
    png_path = f"/tmp/pebblebase_ico_{sz}.png"
    surface.write_to_png(png_path)
    images.append(Image.open(png_path))

ico_path = os.path.join(out_dir, "icon.ico")
images[-1].save(ico_path, format="ICO", sizes=[(s, s) for s in sizes], append_images=images[:-1])
print(f"Generated {ico_path}")
PYEOF
fi

# Mirror assets to cmd/desktop/build/windows for Wails path resolution
cp -rf build/windows cmd/desktop/build/

# Clean up temporary absolute paths on exit
cleanup() {
  python3 -c "
import json
with open('wails.json', 'r') as f:
    d = json.load(f)
d['projectdir'] = './cmd/desktop'
with open('wails.json', 'w') as f:
    json.dump(d, f, indent=2)
"
  rm -rf cmd/desktop/cmd cmd/desktop/build cmd/desktop/web
}
trap cleanup EXIT INT TERM

# Ensure absolute projectdir in wails.json during Windows build to prevent Wails relative path bug
python3 -c "
import json, os
cwd = os.getcwd()
with open('wails.json', 'r') as f:
    d = json.load(f)
d['projectdir'] = os.path.join(cwd, 'cmd/desktop')
with open('wails.json', 'w') as f:
    json.dump(d, f, indent=2)
"

# ------------------------------------------------------------------------------
# 3. Build Web Frontend
# ------------------------------------------------------------------------------
echo "Building frontend web assets..."
if command -v yarn &> /dev/null; then
  (cd web && yarn build)
elif command -v npm &> /dev/null; then
  (cd web && npm run build)
elif command -v pnpm &> /dev/null; then
  (cd web && pnpm build)
elif command -v bun &> /dev/null; then
  (cd web && bun run build)
else
  echo "Error: No Node.js package manager (npm/yarn/pnpm/bun) found."
  exit 1
fi

# ------------------------------------------------------------------------------
# 4. Cross-Compile Windows Binary with Wails & MinGW
# ------------------------------------------------------------------------------
echo "Cross-compiling Windows standalone executable (pebblebase.exe)..."
export CC="x86_64-w64-mingw32-gcc"
export CGO_ENABLED=1

wails build -platform windows/amd64 -s -skipbindings -clean -ldflags "-s -w"

# Locate compiled executable
EXE_SRC=$(find cmd/desktop/build/bin build/bin build -name "pebblebase.exe" 2>/dev/null | head -n 1)
if [ -z "$EXE_SRC" ] || [ ! -f "$EXE_SRC" ]; then
  echo "Error: Failed to find compiled pebblebase.exe."
  exit 1
fi

cp -f "$EXE_SRC" "build/bin/pebblebase.exe"
echo "Windows standalone binary created: build/bin/pebblebase.exe"

# ------------------------------------------------------------------------------
# 5. Build NSIS Windows Setup Installer (if NSIS installed)
# ------------------------------------------------------------------------------
if [ "$HAS_NSIS" = true ]; then
  echo "Packaging Windows 1-click installer with NSIS..."
  wails build -platform windows/amd64 -nsis -s -skipbindings -ldflags "-s -w"

  INSTALLER_SRC=$(find cmd/desktop/build/bin build/bin build -name "*installer.exe" 2>/dev/null | head -n 1)
  if [ -n "$INSTALLER_SRC" ] && [ -f "$INSTALLER_SRC" ]; then
    INSTALLER_DEST="build/bin/${APP_NAME}_${VERSION}_windows_${ARCH}_setup.exe"
    cp -f "$INSTALLER_SRC" "$INSTALLER_DEST"
    echo "Windows setup installer created: $INSTALLER_DEST"
  fi
fi

# ------------------------------------------------------------------------------
# 6. Create Portable ZIP for Teammates
# ------------------------------------------------------------------------------
ZIP_DEST="build/bin/${APP_NAME}_${VERSION}_windows_${ARCH}.zip"
if command -v zip &> /dev/null; then
  echo "Creating portable zip archive for easy sharing..."
  (cd build/bin && rm -f "${APP_NAME}_${VERSION}_windows_${ARCH}.zip" && zip -q -9 "${APP_NAME}_${VERSION}_windows_${ARCH}.zip" pebblebase.exe)
  echo "Portable ZIP package created: $ZIP_DEST"
fi

echo ""
echo "======================================================================"
echo "Windows build complete! Output files located in build/bin/:"
ls -lh build/bin/pebblebase*.exe build/bin/pebblebase*.zip 2>/dev/null || true
echo "======================================================================"
