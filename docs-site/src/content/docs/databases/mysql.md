---
title: MySQL & MariaDB
description: Connecting to MySQL 5.7+, 8.0+, and MariaDB databases.
---

Connect to local or remote MySQL and MariaDB servers.

---

## Connection Settings

- **Host**: IP address or hostname (e.g. `127.0.0.1`).
- **Port**: Default is `3306`.
- **Database**: Target database name.
- **Username / Password**: Your MySQL credentials.

---

## Connection String URL Format

```text
mysql://user:password@tcp(localhost:3306)/my_database?parseTime=true
```
