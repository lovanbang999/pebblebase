# Pebblebase

<p align="center">
  <strong>A modern, lightweight, self-hosted Database Studio for PostgreSQL, MySQL, and MongoDB.</strong><br>
  Available as both a native Linux desktop application and a standalone web server with an embedded React 19 frontend.
</p>

<p align="center">
  <a href="https://go.dev/"><img src="https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat-square&logo=go" alt="Go Version"></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19.0-61DAFB?style=flat-square&logo=react" alt="React 19"></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind-v4.0-38B2AC?style=flat-square&logo=tailwind-css" alt="Tailwind v4"></a>
  <a href="https://wails.io/"><img src="https://img.shields.io/badge/Wails-v2-DF1A2A?style=flat-square&logo=wails" alt="Wails v2"></a>
  <a href="https://github.com/lovanbang999/pebblebase/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License"></a>
  <a href="https://github.com/lovanbang999/pebblebase/actions"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome"></a>
</p>

---

## Overview

Pebblebase is designed around a single core constraint: **it must be trivial to run and maintain.** 
No heavy Docker Compose stacks, no complex runtime dependencies, and no external config servers. You can run it either as a native desktop application on Linux or as a single server binary accessible from any web browser.

- **Encrypted Credentials at Rest**: Connection credentials and passwords are encrypted locally using AES-256-GCM.
- **Dual Runtime Support**: Runs seamlessly as a standalone web service or as a native frameless desktop app built on Wails v2.
- **Single Binary Distribution**: Frontend assets are compiled and embedded directly into the Go binary using `go:embed`.
- **Multilingual Support (i18n)**: Out-of-the-box support for Vietnamese and English with instant switching.
- **Relational and Document Inspector**: Schema introspection, foreign key relation navigation, live WHERE filter builder, pagination, and JSON document editing.

---

## Desktop Studio (Linux)

Pebblebase Studio is available as a native desktop application for Linux distributions (Debian, Ubuntu, Linux Mint, and derivatives).

### Features

- **Frameless Studio Interface**: Replaces standard operating system window decorations with an integrated titlebar featuring active database indicators and quick search.
- **Theme Adaptation**: Titlebar and window controls dynamically adapt to Light and Dark modes.
- **Zero White Flash Startup**: Compositor frame synchronization eliminates white background flashing during window initialization.
- **Command Palette Integration**: Fast keyboard-driven command runner and navigation accessible via `Ctrl+K`.

### Installation (.deb Package)

Install the pre-built Debian package directly using `apt`:

```bash
sudo apt install ./build/bin/pebblebase_0.1.1_amd64.deb
```

To upgrade or reinstall:

```bash
sudo apt install --reinstall ./build/bin/pebblebase_0.1.1_amd64.deb
```

### Building Desktop from Source

Prerequisites:
- Go 1.22+
- Node.js 20+ and Yarn
- Wails CLI v2 (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)
- Linux build dependencies: `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`

```bash
# 1. Build desktop binary
wails build -s -skipbindings -clean

# 2. Package installable Debian package (.deb)
bash ./scripts/package-deb.sh
```

The resulting package will be generated at `build/bin/pebblebase_0.1.1_amd64.deb`.

---

## Web Server Quickstart

### Using Docker

```bash
docker run -d -p 8080:8080 \
  --name pebblebase \
  -e PEBBLEBASE_MASTER_KEY="$(openssl rand -base64 32)" \
  -v pebblebase-data:/data \
  ghcr.io/lovanbang999/pebblebase:latest
```

Then open **[http://localhost:8080](http://localhost:8080)** in your browser.

> [!NOTE]
> Omitting `PEBBLEBASE_MASTER_KEY` causes the server to auto-generate and persist an encryption key in the data volume. For production or team deployments, always supply an explicit key via environment variables.

---

## Key Features

- **Multi-Engine Support**: Native driver integration for PostgreSQL, MySQL, and MongoDB.
- **Interactive Data Grid**: Virtualized high-performance data grid with sorting, filtering, and inline cell inspection.
- **Smart Filter Builder**: Popover-based WHERE clause builder (`=`, `!=`, `>`, `<`, `CONTAINS`).
- **Foreign Key Navigation**: Click-to-navigate relational foreign keys inspired by Prisma Studio.
- **JSON and Schemaless Editor**: Built-in JSON editor for complex document types and dynamic fields.
- **Dark and Light Mode**: Seamless dark and light themes with automatic system preference detection.
- **Browser Autofill Integration**: Automatic style sanitization preventing browser credential autofill color mismatch in light mode.

---

## Keyboard Shortcuts

| Shortcut | Action | Description |
|---|---|---|
| `Ctrl+K` / `Cmd+K` | Command Palette | Open quick search and command palette |
| `Alt+Q` | Query Console | Switch directly to the SQL / MongoDB query console |
| `Alt+E` | ERD Diagram | Open entity relationship diagram view |
| `Ctrl+B` / `Cmd+B` | Toggle Sidebar | Expand or collapse left database navigation sidebar |
| `Ctrl+Enter` / `Cmd+Enter` | Run Query | Execute active SQL query in query editor |
| `F11` | Fullscreen | Toggle fullscreen display mode |

---

## Local Development

### Prerequisites

- **Go**: `1.22+`
- **Node.js**: `20+`
- **Yarn**: `1.22+` or `npm 10+`

### 1. Clone Repository

```bash
git clone https://github.com/lovanbang999/pebblebase.git
cd pebblebase
```

### 2. Run Backend (Go Server)

```bash
# Copy example environment file
cp .env.example .env

# Run Go backend server (listening on :8080)
go run ./cmd/server
```

Health check endpoint: `curl http://localhost:8080/health`

### 3. Run Frontend (React + Vite)

```bash
cd web
yarn install
yarn dev
```

The Vite dev server will start on **[http://localhost:5173](http://localhost:5173)** with Hot Module Replacement (HMR).

### 4. Production Web Server Build

To compile a production-ready single binary with embedded frontend:

```bash
# Build frontend static assets into web/dist
cd web && yarn build && cd ..

# Compile single standalone binary
go build -ldflags="-s -w" -o pebblebase ./cmd/server
```

---

## Configuration Reference

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP listen port for the server |
| `PEBBLEBASE_MASTER_KEY` | *(auto-generated)* | Base64-encoded 32-byte key used for AES-256-GCM encryption of stored passwords |
| `PEBBLEBASE_DATA_DIR` | `./data` | Directory path where SQLite database and app data are stored |

---

## Architecture

```
pebblebase/
├── cmd/
│   ├── server/         # Headless HTTP server & embedded web asset host
│   └── desktop/        # Wails v2 native desktop application entrypoint
├── internal/
│   ├── adapter/        # DB-agnostic contract and driver adapters (Postgres, MySQL, Mongo)
│   ├── schema/         # Unified schema models (Table, Column, Relation)
│   ├── connection/     # Connection manager and DSN builders
│   ├── storage/        # AES-256-GCM encryption and local SQLite store
│   └── api/            # REST API handlers
├── web/                # React 19 + Vite + TypeScript + Tailwind CSS v4 + Base UI
├── scripts/
│   └── package-deb.sh  # Automated Debian package builder (.deb)
└── build/              # Desktop build artifacts, application icons, and Debian staging
```

The `adapter.Adapter` Go interface acts as the central contract. All UI and REST API handlers interact exclusively through this interface, ensuring database driver isolation and clean modularity.

---

## Contributing

Contributions, issues, and feature requests are welcome. Check out our [Contributing Guide](.github/CONTRIBUTING.md) and [Code of Conduct](.github/CODE_OF_CONDUCT.md).

1. Fork the project
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

---

## Security Policy

See [.github/SECURITY.md](.github/SECURITY.md) for security policy and vulnerability disclosure details.

---

## License

Distributed under the **MIT License**. See `LICENSE` for more information.
