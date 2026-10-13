---
title: Quickstart Guide
description: Get up and running with your first database connection in under 2 minutes.
---

Follow this quick guide to connect to your first database and start exploring your data.

---

## Step 1: Open Pebblebase Studio

Launch the app on your computer. On the initial screen, click **"Add Connection"** or press `Ctrl+N` / `Cmd+N`.

---

## Step 2: Choose Your Database Engine

Select the type of database you want to connect to:

- **PostgreSQL**: Enter host, port (default `5432`), user, password, and database name.
- **MySQL / MariaDB**: Enter host, port (default `3306`), user, password, and database name.
- **SQLite**: Click **Browse** to select any `.sqlite`, `.db`, or `.sqlite3` file on your local drive.
- **MongoDB**: Provide your standard connection URI (e.g. `mongodb://localhost:27017/mydb`).

---

## Step 3: Test & Save Connection

Click **"Test Connection"** to verify network connectivity and credentials. Once verified, click **"Save & Connect"**.

Pebblebase will instantly introspect the database schema, mapping out:
- All tables, collections, and views
- Primary and foreign keys
- Column types, defaults, and constraints

---

## Step 4: Explore Your Tables

- **Browse Data**: Click any table in the left sidebar to open the high-speed virtualized Data Grid.
- **Filter & Search**: Press `Ctrl+F` on any column header to filter rows instantly.
- **Inline Editing**: Double-click any cell to edit values directly.
- **Inspect ERD**: Press `Alt+E` to visualize how your tables relate to each other.
