#!/usr/bin/env python3
import json
import os
import sqlite3
import sys
import uuid

def seed_perf_db(db_path: str):
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    if os.path.exists(db_path):
        os.remove(db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Enable WAL mode and synchronous=NORMAL for high speed generation
    cur.execute("PRAGMA journal_mode = WAL;")
    cur.execute("PRAGMA synchronous = NORMAL;")

    # 1. Create table with 20 heterogeneous columns
    cur.execute("""
    CREATE TABLE IF NOT EXISTS perf_50k (
        id INTEGER PRIMARY KEY,
        int_col1 INTEGER NOT NULL,
        int_col2 INTEGER NOT NULL,
        int_col3 INTEGER NOT NULL,
        float_col1 REAL NOT NULL,
        float_col2 REAL NOT NULL,
        short_text1 TEXT NOT NULL,
        short_text2 TEXT NOT NULL,
        long_desc TEXT NOT NULL,
        email TEXT NOT NULL,
        username TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        event_date TEXT NOT NULL,
        is_active INTEGER NOT NULL,
        is_verified INTEGER NOT NULL,
        json_metadata TEXT NOT NULL,
        tags_array TEXT NOT NULL,
        uuid_code TEXT NOT NULL
    );
    """)

    print("[Seed Perf] Generating 50,000 rows x 20 columns...")
    batch_size = 5000
    total_rows = 50000

    insert_sql = """
    INSERT INTO perf_50k (
        id, int_col1, int_col2, int_col3, float_col1, float_col2,
        short_text1, short_text2, long_desc, email, username, status,
        created_at, updated_at, event_date, is_active, is_verified,
        json_metadata, tags_array, uuid_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """

    for start_id in range(1, total_rows + 1, batch_size):
        batch = []
        for i in range(start_id, min(start_id + batch_size, total_rows + 1)):
            batch.append((
                i,
                i * 7,
                (i % 100) * 10,
                i // 10,
                round(i * 1.4142, 4),
                round(i / 3.1415, 2),
                f"SHORT_{i % 50}",
                f"CODE_{(i * 13) % 997}",
                f"Description for performance entity #{i} with random payload words",
                f"perf_user_{i}@pebblebase.dev",
                f"perf_user_{i}",
                "active" if i % 2 == 0 else ("pending" if i % 3 == 0 else "archived"),
                "2026-01-15 08:30:00",
                "2026-02-01 14:45:10",
                f"2026-03-{(i % 28) + 1:02d}",
                1 if i % 2 == 0 else 0,
                1 if i % 5 != 0 else 0,
                f'{{"tier":"grade_{i % 4}","points":{i * 15},"flags":["fast","indexed"]}}',
                f'["perf","tier_{i % 5}","col20"]',
                f"uuid-{i:08x}-4000-8000-{i:012x}"
            ))
        cur.executemany(insert_sql, batch)

    print(f"[Seed Perf] Successfully inserted {total_rows:,} rows into perf_50k.")

    # 2. Create 20 tables for Memory Leak audit (opening/closing 20 distinct tabs)
    for t_idx in range(1, 21):
        tbl_name = f"leak_test_{t_idx:02d}"
        cur.execute(f"""
        CREATE TABLE IF NOT EXISTS {tbl_name} (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            score REAL NOT NULL,
            created_at TEXT NOT NULL
        );
        """)
        cur.execute(f"""
        INSERT INTO {tbl_name} (id, title, score, created_at) VALUES
        (1, 'Sample title for {tbl_name}', 98.5, '2026-03-01 10:00:00'),
        (2, 'Secondary record for {tbl_name}', 88.0, '2026-03-01 10:05:00');
        """)

    # 3. Create large cell table with a 2.1 MB JSON document
    cur.execute("""
    CREATE TABLE IF NOT EXISTS large_cells (
        id INTEGER PRIMARY KEY,
        doc_name TEXT NOT NULL,
        json_payload TEXT NOT NULL
    );
    """)

    # Generate a JSON document that is precisely ~2.1 MB
    # 8,600 items x ~250 bytes = ~2.1 MB
    items = []
    chunk = "A" * 150
    for idx in range(8600):
        items.append({
            "idx": idx,
            "id": f"item_{idx:05d}",
            "desc": f"Synthetic benchmark payload entry {idx} {chunk}",
            "value": idx * 1.5
        })
    doc = {
        "metadata": {
            "type": "large_json_benchmark",
            "version": "1.0.0",
            "recordCount": len(items)
        },
        "records": items
    }
    json_str = json.dumps(doc)
    doc_bytes = len(json_str.encode("utf-8"))
    mb_size = doc_bytes / (1024 * 1024)
    print(f"[Seed Perf] Generated JSON payload: {doc_bytes:,} bytes ({mb_size:.2f} MB)")

    cur.execute(
        "INSERT INTO large_cells (id, doc_name, json_payload) VALUES (?, ?, ?)",
        (1, "Benchmark 2.1MB Document", json_str)
    )

    conn.commit()
    conn.close()
    print(f"[Seed Perf] Database successfully seeded at: {db_path}")

if __name__ == "__main__":
    target_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(__file__), "../testdata/perf_50k.db"
    )
    seed_perf_db(target_path)
