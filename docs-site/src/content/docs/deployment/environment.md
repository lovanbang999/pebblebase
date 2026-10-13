---
title: Environment Variables
description: Complete configuration reference for environment variables in Pebblebase Studio.
---

Pebblebase Studio is configured via environment variables.

---

## Configuration Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `8080` | Port for the web server to listen on. |
| `DATA_DIR` | `./data` | Directory where configuration and internal SQLite databases are saved. |
| `PEBBLEBASE_AUTH_ENABLED` | `true` | Enables or disables authentication screen. |
| `SESSION_SECRET` | *(random)* | Key used to sign session JWTs. |
| `APP_ENV` | `production` | Environment mode (`development` or `production`). |
