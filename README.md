# Pebblebase

A self-hosted database GUI for Postgres, MySQL, and MongoDB. Ships as a single Go binary with the frontend embedded — no separate web server, no runtime dependencies.

[![CI](https://github.com/YOUR_USERNAME/pebblebase/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/pebblebase/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Overview

Pebblebase is designed around one constraint: it has to be trivial to run. No Docker Compose stacks, no config files required, no external dependencies at runtime. You start one process and get a fully functional database GUI.

Connection credentials are stored locally and encrypted at rest with AES-256-GCM. The encryption key is supplied via environment variable, keeping it separate from the data volume.

---

## Quickstart

```bash
docker run -p 8080:8080 \
  -e PEBBLEBASE_MASTER_KEY="$(openssl rand -base64 32)" \
  -v pebblebase-data:/data \
  ghcr.io/YOUR_USERNAME/pebblebase:latest
```

Then open [http://localhost:8080](http://localhost:8080).

> **Note:** Omitting `PEBBLEBASE_MASTER_KEY` causes the server to auto-generate and persist a key inside the data volume. This is fine for personal local use. For team or production deployments, always supply the key explicitly via the environment.

---

## Development

**Prerequisites:** Go 1.22+, Node.js 20+

### Backend

```bash
go run ./cmd/server
# Starts on :8080. Health check: curl http://localhost:8080/health
```

### Frontend

```bash
cd web
npm install
npm run dev
# Vite dev server starts on :5173 with HMR
```

### Production build

```bash
# 1. Build frontend assets
cd web && npm run build && cd ..

# 2. Compile Go binary (embeds web/dist in Phase 6+)
go build -ldflags="-s -w" -o pebblebase ./cmd/server
```

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP listen port |
| `PEBBLEBASE_MASTER_KEY` | *(auto-generated)* | Base64-encoded 32-byte key used for AES-256-GCM encryption of stored passwords |

Copy `.env.example` to `.env` for local development.

---

## Architecture

```
pebblebase/
├── cmd/server/         Entry point — HTTP server
├── internal/
│   ├── adapter/        DB-agnostic interface + per-driver implementations
│   ├── schema/         Unified schema model (Table, Column, Relation)
│   ├── connection/     DSN builder, connection DTO
│   ├── storage/        AES-GCM encryptor, connection persistence
│   └── api/            HTTP handlers
└── web/                React + Vite + TypeScript + shadcn/ui
```

The `adapter.Adapter` interface is the central contract. All UI and API code talks exclusively through this interface — no layer imports a database driver directly.

---

## Status

| Phase | Description | Status |
|---|---|---|
| 0 | Project skeleton | done |
| 1 | Unified schema model + Adapter interface | next |
| 2 | Connection management & encrypted storage | — |
| 3 | REST API layer | — |
| 4 | Basic frontend — connection screen + data grid | — |
| 5 | MySQL adapter | — |
| 6 | Frontend embed + single-binary Docker image | — |
| 7 | MongoDB adapter | — |
| 8 | UI/UX polish | — |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

[MIT](LICENSE)
