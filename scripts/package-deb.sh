#!/bin/bash
set -e

# ==============================================================================
# Pebblebase Studio - Linux .deb Packaging Script
# Packages build/bin/pebblebase into a 1-click installable Debian/Ubuntu .deb
# ==============================================================================

VERSION="0.1.1"
ARCH="amd64"
APP_NAME="pebblebase"
PKG_DIR="build/deb_pkg"
DEB_NAME="${APP_NAME}_${VERSION}_${ARCH}.deb"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if [ ! -f "build/bin/pebblebase" ]; then
  echo "Error: build/bin/pebblebase not found. Please run 'wails build' first."
  exit 1
fi

echo "📦 Packaging Pebblebase Studio v${VERSION} (.deb)..."

# Clean up any previous package staging
rm -rf "$PKG_DIR"
mkdir -p "$PKG_DIR/DEBIAN"
mkdir -p "$PKG_DIR/usr/bin"
mkdir -p "$PKG_DIR/usr/share/applications"
mkdir -p "$PKG_DIR/usr/share/icons/hicolor/scalable/apps"

# 1. Install binary
cp -f "build/bin/pebblebase" "$PKG_DIR/usr/bin/pebblebase"
chmod 755 "$PKG_DIR/usr/bin/pebblebase"

# 2. Install desktop launcher
cat <<EOF > "$PKG_DIR/usr/share/applications/pebblebase.desktop"
[Desktop Entry]
Name=Pebblebase Studio
Comment=Modern lightweight database studio
Exec=/usr/bin/pebblebase
Icon=pebblebase
Terminal=false
Type=Application
Categories=Development;Database;IDE;
StartupWMClass=pebblebase
EOF
chmod 644 "$PKG_DIR/usr/share/applications/pebblebase.desktop"

# 3. Install App Icon
if [ -f "web/public/favicon.svg" ]; then
  cp -f "web/public/favicon.svg" "$PKG_DIR/usr/share/icons/hicolor/scalable/apps/pebblebase.svg"
  chmod 644 "$PKG_DIR/usr/share/icons/hicolor/scalable/apps/pebblebase.svg"
fi

# 4. Control file
cat <<EOF > "$PKG_DIR/DEBIAN/control"
Package: ${APP_NAME}
Version: ${VERSION}
Section: database
Priority: optional
Architecture: ${ARCH}
Maintainer: Pebblebase Team <lovanbangbox9@gmail.com>
Depends: libgtk-3-0, libwebkit2gtk-4.1-0 | libwebkit2gtk-4.0-37
Description: Pebblebase Studio - Modern lightweight database studio
 Native desktop database management tool for PostgreSQL, MySQL, SQLite, and MongoDB.
 Zero-overhead in-memory core with modern React interface.
EOF
chmod 644 "$PKG_DIR/DEBIAN/control"

# 5. Build .deb package with dpkg-deb
dpkg-deb --build --root-owner-group "$PKG_DIR" "build/bin/${DEB_NAME}"

# Clean up staging dir
rm -rf "$PKG_DIR"

echo "✅ Successfully built Debian package: build/bin/${DEB_NAME}"
ls -lh "build/bin/${DEB_NAME}"
