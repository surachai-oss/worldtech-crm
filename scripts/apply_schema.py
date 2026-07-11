#!/usr/bin/env python3
"""Apply supabase/schema.sql directly to the project's Postgres database.

Credentials come from .env.db (gitignored, local-only — see README/CLAUDE.md).
The whole file is sent as one query so dollar-quoted function bodies
(`$$ ... $$`) are parsed correctly by the server, same as `psql -f schema.sql`.

Usage: python3 scripts/apply_schema.py
"""
import pathlib
import ssl
import sys

import pg8000

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.db"
SCHEMA_FILE = ROOT / "supabase" / "schema.sql"


def load_env(path):
    env = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


def main():
    if not ENV_FILE.exists():
        sys.exit(f"missing {ENV_FILE} — see CLAUDE.md for how to set it up")
    env = load_env(ENV_FILE)

    conn = pg8000.connect(
        host=env["SUPABASE_DB_HOST"],
        port=int(env.get("SUPABASE_DB_PORT", 5432)),
        user=env["SUPABASE_DB_USER"],
        password=env["SUPABASE_DB_PASSWORD"],
        database=env.get("SUPABASE_DB_NAME", "postgres"),
        ssl_context=ssl.create_default_context(),
    )
    try:
        cur = conn.cursor()
        cur.execute(SCHEMA_FILE.read_text())
        conn.commit()
        print(f"applied {SCHEMA_FILE.relative_to(ROOT)} successfully")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
