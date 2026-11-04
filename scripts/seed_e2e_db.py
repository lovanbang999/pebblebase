#!/usr/bin/env python3
import os
import sqlite3

def seed_db(db_path: str):
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    if os.path.exists(db_path):
        os.remove(db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'customer',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    """)

    users = []
    for i in range(1, 551):
        users.append((
            i,
            f"User {i}",
            f"user{i}@example.com",
            "admin" if i % 10 == 0 else "customer",
            "active" if i % 2 == 0 else "inactive",
            "2026-01-01 12:00:00"
        ))

    cur.executemany(
        "INSERT INTO users (id, name, email, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        users
    )

    cur.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        stock_quantity INTEGER NOT NULL DEFAULT 0
    );
    """)

    products = [
        (i, f"SKU-{i:04d}", f"Product {i}", 19.99 + i, 100 + i)
        for i in range(1, 51)
    ]
    cur.executemany(
        "INSERT INTO products (id, sku, name, price, stock_quantity) VALUES (?, ?, ?, ?, ?)",
        products
    )

    conn.commit()
    conn.close()
    print(f"Successfully seeded SQLite database at {db_path} with 550 users and 50 products.")

if __name__ == "__main__":
    import sys
    target = sys.argv[1] if len(sys.argv) > 1 else "testdata/e2e_seed.db"
    seed_db(target)

