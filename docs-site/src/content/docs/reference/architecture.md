---
title: Architecture Overview
description: High-level architectural design of Pebblebase Studio, Go backend, and React desktop frontend.
---

Pebblebase Studio is structured as a modular desktop and web application.

---

## Architectural Stack

```
┌────────────────────────────────────────────────────────┐
│               Frontend: React 19 + Vite                │
│       Tailwind CSS v4 + CodeMirror 6 + @xyflow/react    │
└───────────────────────────▲────────────────────────────┘
                            │ HTTP / Wails IPC
┌───────────────────────────▼────────────────────────────┐
│                    Go Core Backend                     │
│  - Engine Drivers (pgx, go-sql-driver, modernc/sqlite) │
│  - Schema Introspector & DDL Diff Engine               │
│  - Local HTTP Loopback Listener & Auto-Update Service  │
└────────────────────────────────────────────────────────┘
```

---

## Key Design Principles

1. **Lightweight Distribution**: Wails leverages the host OS's native webview (WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux), resulting in a compact download footprint (~12MB) compared to 150MB+ for Electron apps.
2. **Local Security Guarantee**: Credentials and connections are encrypted locally with AES-GCM and stored only in your user directory.
3. **Loopback API Compatibility**: A local HTTP listener allows the same Go engine to serve both desktop and self-hosted Docker web modes.
