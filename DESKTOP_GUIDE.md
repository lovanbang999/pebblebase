# Pebblebase Desktop Studio Guide

This document covers the architecture, build pipeline, frame synchronization mechanisms, and Linux Debian packaging for Pebblebase Desktop Studio.

---

## Overview

Pebblebase Desktop Studio is a native Linux application built using the Wails v2 framework. It pairs a Go runtime with an embedded React 19 web frontend rendered through WebKit2GTK.

Key architectural characteristics:
- **Loopback API Service**: The Go backend binds an internal HTTP server on `127.0.0.1` with dynamic port assignment, storing user configuration under `~/.config/pebblebase`.
- **Frameless Window**: Standard GNOME / GTK window decorations are disabled in favor of an integrated Studio Titlebar matching the application theme.
- **Debian (.deb) Distribution**: Automated packaging script generates standard Debian packages with application icons, desktop entries, and MIME triggers.

---

## Build Prerequisites

To compile the desktop client and generate Debian packages on Linux (Ubuntu / Debian):

### 1. Development Tools

- **Go**: 1.22 or higher
- **Node.js**: 20 or higher
- **Yarn**: 1.22 or higher
- **Wails CLI**: v2.16 or higher

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

### 2. System Libraries

Install native GTK3 and WebKitGTK development headers along with Cairo and Rsvg for icon rendering:

```bash
sudo apt update
sudo apt install -y \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  python3-cairo \
  python3-gi \
  dpkg-deb
```

---

## Build Pipeline

### 1. Compile Desktop Binary

The desktop binary is compiled using the Wails CLI:

```bash
# From the project root
wails build -s -skipbindings -clean -ldflags "-s -w"
```

- `-s`: Suppresses non-essential build logs for faster compilation.
- `-skipbindings`: Skips regenerating Go-TypeScript bindings when only frontend UI or packaging changes are made.
- `-clean`: Cleans existing build outputs before compiling.
- `-ldflags "-s -w"`: Strips DWARF debug information and symbol tables, reducing the binary size by ~30–40%.

The compiled binary will be placed at `build/bin/pebblebase`.

### 2. Package Debian Installer (.deb)

The packaging script bundles the compiled binary into a Debian package:

```bash
bash ./scripts/package-deb.sh
```

What the script performs:
1. Validates presence of `build/bin/pebblebase`.
2. Assembles directory hierarchy: `/usr/bin`, `/usr/share/applications`, `/usr/share/icons`.
3. Renders multi-resolution PNG icons (16x16, 32x32, 48x48, 64x64, 128x128, 256x256, 512x512) and vector SVG icon from `web/public/favicon.svg`.
4. Writes desktop entry file `pebblebase.desktop` with category classifications (`Development;Database;IDE`).
5. Generates Debian control file with dependency definitions (`libgtk-3-0`, `libwebkit2gtk-4.1-0`).
6. Generates `postinst` and `postrm` scripts triggering `gtk-update-icon-cache` and `update-desktop-database`.
7. Builds Debian archive via `dpkg-deb` into `build/bin/pebblebase_0.1.1_amd64.deb`.

---

## Technical Implementations

### 1. Frameless Window and Drag Regions

The application configures Wails with `Frameless: true` in `cmd/desktop/main.go`. This strips the native operating system titlebar.

Window drag behavior is governed by CSS variables:
- `--wails-draggable: drag`: Applied to the `<header>` element of `DesktopTitleBar`, enabling window moving when dragging the bar.
- `--wails-draggable: no-drag`: Applied to interactive elements within the titlebar (buttons, inputs, dropdowns) to prevent click events from being swallowed as drag actions.
- Double-clicking the titlebar triggers `WindowToggleMaximise()`.

### 2. Compositor Frame Synchronization

On Linux X11/Wayland with WebKitGTK, opening a frameless window immediately upon `OnDomReady` can produce a split-second white flash because WebKitGTK's compositing thread rasterizes the dark background asynchronously.

To eliminate this artifact:
- `StartHidden: true`: The GTK window starts in an unmapped state.
- `OnDomReady`: A 120ms frame flush delay gives the WebKit compositor time to flush initial dark frames to Cairo backbuffers before calling `runtime.WindowShow(ctx)`.
- `index.html`: A double `requestAnimationFrame` tick invokes `WindowShow()` only after the initial frame has been rendered to the display.

### 3. Layout Top Offset Synchronization

Because the custom titlebar occupies 38px at the top of the window, the navigation sidebar must not begin at `y = 0`.

- The root container sets `--titlebar-height: 38px` when `isDesktopApp()` is true, and `0px` in standard web browsers.
- The sidebar container specifies `top: var(--titlebar-height, 0px)` and height `calc(100svh - var(--titlebar-height, 0px))`, preventing any visual overlap with the studio titlebar.

---

## Installation and Removal

### Install .deb Package

```bash
sudo apt install ./build/bin/pebblebase_0.1.1_amd64.deb
```

### Reinstall / Upgrade

```bash
sudo apt install --reinstall ./build/bin/pebblebase_0.1.1_amd64.deb
```

### Uninstall Package

```bash
sudo apt remove pebblebase
```
