"""
export_data.py — Fetch session events + self-reports from the DeepFocus
backend API and save as CSV for model training.

Usage:
    python export_data.py --base-url http://localhost:8000/api --token <jwt_access_token>
    python export_data.py --db ../backend/db.sqlite3   # Direct SQLite access (local dev)
"""

import argparse
import csv
import sqlite3
import sys

from features import ALL_FEATURES, LEGACY_BOOLEANS
from paths import EVENTS_CSV, SELF_REPORTS_CSV, ensure_dirs

# Shape of each exported row. The first three columns are session metadata
# that are not themselves features but are needed to reconstruct the dataset.
EVENT_COLS = ["session_id", "timestamp", "focus_score"] + LEGACY_BOOLEANS + ALL_FEATURES
REPORT_COLS = ["session_id", "timestamp", "report_type", "score"]


def export_from_sqlite(db_path: str):
    """Read events and self-reports directly from a SQLite database file."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    ensure_dirs()

    # Events.
    columns_sql = ", ".join(EVENT_COLS)
    cur = conn.execute(
        f"SELECT {columns_sql} FROM api_sessionevent ORDER BY timestamp",
    )
    rows = cur.fetchall()

    with open(EVENTS_CSV, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(EVENT_COLS)
        for row in rows:
            writer.writerow([row[col] for col in EVENT_COLS])
    print(f"Exported {len(rows)} events → {EVENTS_CSV}")

    # Self-reports.
    cur = conn.execute(
        "SELECT session_id, timestamp, report_type, score "
        "FROM api_selfreport ORDER BY timestamp",
    )
    rows = cur.fetchall()

    with open(SELF_REPORTS_CSV, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(REPORT_COLS)
        for row in rows:
            writer.writerow([row[col] for col in REPORT_COLS])
    print(f"Exported {len(rows)} self-reports → {SELF_REPORTS_CSV}")

    conn.close()


def export_from_api(base_url: str, token: str):
    """Fetch the events export via the authenticated REST API."""
    try:
        import requests
    except ImportError:
        print("pip install requests")
        sys.exit(1)

    headers = {"Authorization": f"Bearer {token}"}
    ensure_dirs()

    resp = requests.get(f"{base_url}/ml/export/?format=json", headers=headers)
    resp.raise_for_status()
    events = resp.json()

    if events:
        with open(EVENTS_CSV, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=EVENT_COLS)
            writer.writeheader()
            for e in events:
                writer.writerow({col: e.get(col) for col in EVENT_COLS})

    print(f"Exported {len(events)} events → {EVENTS_CSV}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export DeepFocus data for ML training")
    parser.add_argument("--db", default="../backend/db.sqlite3", help="Path to SQLite database")
    parser.add_argument("--base-url", help="API base URL (e.g., http://localhost:8000/api)")
    parser.add_argument("--token", help="JWT access token for API")
    args = parser.parse_args()

    if args.base_url and args.token:
        export_from_api(args.base_url, args.token)
    else:
        db_path = Path(args.db)
        if not db_path.exists():
            print(f"Database not found: {db_path}")
            sys.exit(1)
        export_from_sqlite(str(db_path))
