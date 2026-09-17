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
mkdir -p "$PKG_DIR/usr/share/pixmaps"
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

# 3. Install App Icons (Scalable SVG + Multi-resolution PNGs for GNOME/KDE/XFCE)
if [ -f "web/public/favicon.svg" ]; then
  # Scalable vector icon
  cp -f "web/public/favicon.svg" "$PKG_DIR/usr/share/icons/hicolor/scalable/apps/pebblebase.svg"
  chmod 644 "$PKG_DIR/usr/share/icons/hicolor/scalable/apps/pebblebase.svg"
  cp -f "web/public/favicon.svg" "$PKG_DIR/usr/share/pixmaps/pebblebase.svg"
  chmod 644 "$PKG_DIR/usr/share/pixmaps/pebblebase.svg"

  # Render pixel-perfect PNG icons for standard Linux resolutions
  python3 - << 'PYEOF'
import os
import gi
gi.require_version('Rsvg', '2.0')
from gi.repository import Rsvg
import cairo

svg_file = "web/public/favicon.svg"
pkg_dir = os.environ.get("PKG_DIR", "build/deb_pkg")

try:
    handle = Rsvg.Handle.new_from_file(svg_file)
    sizes = [16, 32, 48, 64, 128, 256, 512]
    for sz in sizes:
        d = f"{pkg_dir}/usr/share/icons/hicolor/{sz}x{sz}/apps"
        os.makedirs(d, exist_ok=True)
        surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, sz, sz)
        ctx = cairo.Context(surface)
        ctx.scale(sz / 128.0, sz / 128.0)
        handle.render_cairo(ctx)
        surface.write_to_png(f"{d}/pebblebase.png")

    # Pixmaps fallback (256x256)
    os.makedirs(f"{pkg_dir}/usr/share/pixmaps", exist_ok=True)
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, 256, 256)
    ctx = cairo.Context(surface)
    ctx.scale(256 / 128.0, 256 / 128.0)
    handle.render_cairo(ctx)
    surface.write_to_png(f"{pkg_dir}/usr/share/pixmaps/pebblebase.png")
except Exception as e:
    print(f"Notice: Optional PNG icon generation skipped: {e}")
PYEOF
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

# 5. Maintainer scripts for instant icon cache & desktop database refresh
cat << 'EOF' > "$PKG_DIR/DEBIAN/postinst"
#!/bin/sh
set -e
if which gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor 2>/dev/null || true
fi
if which update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q 2>/dev/null || true
fi
EOF
chmod 755 "$PKG_DIR/DEBIAN/postinst"

cat << 'EOF' > "$PKG_DIR/DEBIAN/postrm"
#!/bin/sh
set -e
if which gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor 2>/dev/null || true
fi
if which update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q 2>/dev/null || true
fi
EOF
chmod 755 "$PKG_DIR/DEBIAN/postrm"

# 6. Build .deb package with dpkg-deb
dpkg-deb --build --root-owner-group "$PKG_DIR" "build/bin/${DEB_NAME}"

# Clean up staging dir
rm -rf "$PKG_DIR"

echo "✅ Successfully built Debian package: build/bin/${DEB_NAME}"
ls -lh "build/bin/${DEB_NAME}"
