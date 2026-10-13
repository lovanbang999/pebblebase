---
title: Introduction
description: Overview of Pebblebase Studio architecture, vision, and core capabilities.
---

**Pebblebase Studio** is an open-source, lightweight, cross-platform database management tool crafted for developers who want native performance without the heavy resource usage of Electron-based apps.

Powered by a high-performance **Go** backend and **Wails v2**, Pebblebase Studio provides an elegant, modern UI for inspecting, modifying, and comparing data across major SQL and NoSQL databases.

---

## Why Pebblebase Studio?

Traditional database GUIs often suffer from sluggish launch times, bloated memory footprints, cluttered legacy interfaces, or expensive commercial licenses. Pebblebase Studio was created with three core pillars:

1. **Lightweight & Native**: Starts in under 300ms and consumes ~80MB RAM on average.
2. **Developer-First Workflow**: Features interactive visual ERD diagrams, cross-database schema diffing, and keyboard-first shortcuts (`Ctrl+K`, `Alt+Q`, `Alt+E`).
3. **100% Privacy & Local-First**: Your connection strings, credentials, and query data never leave your local machine or private server.

---

## Supported Database Engines

- **PostgreSQL** (v12+) — Full schema introspection, relations, and table inspection.
- **MySQL & MariaDB** (v5.7+, v8.0+, MariaDB 10+) — High-speed queries and index analysis.
- **SQLite** (v3) — Direct local file management with embedded transaction safety.
- **MongoDB** (v4.4+) — Document view, JSON editing, and collections inspection.

---

## Ready to Begin?

Head over to the [Installation Guide](/pebblebase/getting-started/installation/) to download Pebblebase Studio for your operating system.
