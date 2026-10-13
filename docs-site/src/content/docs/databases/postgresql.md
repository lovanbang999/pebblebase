---
title: PostgreSQL
description: Connecting to PostgreSQL, managing schemas, SSL connections, and query execution.
---

Pebblebase Studio provides first-class support for PostgreSQL versions 12, 13, 14, 15, 16, and newer.

---

## Connection Settings

- **Host**: IP address or hostname of your database server (e.g. `127.0.0.1` or `db.example.com`).
- **Port**: Default is `5432`.
- **Database**: Target database name.
- **Username / Password**: Your PostgreSQL role credentials.
- **SSL Mode**: Supports `disable`, `require`, and `verify-full`.

---

## Connection String URL Format

You can also paste standard PostgreSQL URLs directly:
```text
postgres://user:password@localhost:5432/my_database?sslmode=disable
```
