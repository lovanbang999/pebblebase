---
title: Installation Guide
description: How to install and run Pebblebase Studio on macOS, Windows, Linux, and Docker.
---

Pebblebase Studio is distributed as pre-compiled, self-contained desktop binaries for all major platforms. You can download the latest official release directly from [GitHub Releases](https://github.com/lovanbang999/pebblebase/releases/latest).

---

## 🍏 macOS Installation

Pebblebase provides a **Universal binary** compatible with both Apple Silicon (M1/M2/M3/M4) and Intel Macs:

1. Download **`pebblebase-darwin-universal.app.zip`** from [GitHub Releases](https://github.com/lovanbang999/pebblebase/releases/latest).
2. Double-click the `.zip` archive to extract **`pebblebase.app`**.
3. Move `pebblebase.app` into your `/Applications` directory.
4. Launch the application from Launchpad or Spotlight (`Cmd + Space`).

> **Note on First Launch:**  
> Because the app is open-source and not notarized through Apple's paid program, macOS Gatekeeper may show a warning on first launch. Right-click `pebblebase.app` in Finder, click **Open**, and confirm. Alternatively, run in Terminal:
> ```bash
> xattr -cr /Applications/pebblebase.app
> ```

---

## 🪟 Windows Installation

1. Download **`pebblebase-windows-amd64.zip`** from [GitHub Releases](https://github.com/lovanbang999/pebblebase/releases/latest).
2. Right-click the `.zip` file and select **Extract All**.
3. Double-click **`pebblebase.exe`** to start using the app.

> **Portable Executable:**  
> Pebblebase Studio on Windows is fully portable—no administrative privileges or MSI installer required. You can run it directly from your Downloads folder or a USB drive.

---

## 🐧 Linux Installation

Pebblebase is compatible with Ubuntu, Debian, Fedora, Arch, and most standard Linux distributions:

1. Download **`pebblebase-linux-amd64.tar.gz`** from [GitHub Releases](https://github.com/lovanbang999/pebblebase/releases/latest).
2. Extract the archive and launch the binary:
   ```bash
   tar -xzvf pebblebase-linux-amd64.tar.gz
   ./pebblebase
   ```

### Dependencies
Ensure your Linux distribution has GTK3 and WebKitGTK installed:
* **Ubuntu/Debian:** `sudo apt install libgtk-3-0 libwebkit2gtk-4.1-0` (or `libwebkit2gtk-4.0-37`)
* **Fedora:** `sudo dnf install gtk3 webkit2gtk4.1`
* **Arch Linux:** `sudo pacman -S gtk3 webkit2gtk-4.1`

---

## 🐳 Docker (Self-Hosted Web Studio)

Want to run Pebblebase Studio as a private team web portal? Run the official Docker container:

```bash
docker run -d \
  --name pebblebase \
  -p 8080:8080 \
  -v pebblebase_data:/data \
  ghcr.io/lovanbang999/pebblebase:latest
```

Open your browser at `http://localhost:8080` to access the web studio.
