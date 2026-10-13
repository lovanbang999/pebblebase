---
title: Schema Diff & Sync
description: Compare database structures across development, staging, and production environments.
---

Database migrations can easily drift across environments. The **Schema Diff** tool lets you pick any two database connections and compare their structural definitions side-by-side.

---

## How It Works

1. Open **Schema Diff** from the sidebar or via Command Palette (`Ctrl+K`).
2. Select your **Source Connection** (e.g. `Local Staging`) and **Target Connection** (e.g. `Production`).
3. Click **"Compare Schemas"**.

---

## Diff Analysis

Pebblebase compares:
- **Missing / Extra Tables**: Tables existing in one environment but not the other.
- **Column Drift**: Added columns, dropped columns, and mismatched data types (e.g. `VARCHAR(255)` vs `TEXT`).
- **Index & Constraint Discrepancies**: Missing primary keys, unique constraints, or foreign keys.

The interface generates the exact DDL migration script needed to bring the target database into full alignment.
