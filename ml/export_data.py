"""
export_data.py — Fetch session events + self-reports from the DeepFocus
backend API and save as CSV for model training.

Usage:
    python export_data.py --base-url http://localhost:8000/api --token <jwt_access_token>
    python export_data.py --db ../backend/db.sqlite3   # Direct SQLite access (local dev)
"""

import argparse
import csv
import json
import os
import sqlite3
import sys
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent / "data"


# ── ML feature columns (must match SessionEvent model) ──
ML_FEATURE_COLS = [
    "head_yaw", "head_pitch", "head_roll",
    "ear_left", "ear_right", "gaze_x", "gaze_y", "face_confidence",
    "keystroke_rate", "mouse_velocity", "mouse_distance",
    "click_rate", "scroll_rate", "idle_duration", "activity_level",
    "tab_switch_count", "window_blur_count",
    "time_since_tab_return", "session_elapsed_ratio",
    "focus_ema_30s", "focus_ema_5min", "focus_trend", "distraction_burst_count",
]

LEGACY_BOOL_COLS = ["is_tab_hidden", "is_idle", "is_face_missing", "is_looking_away"]

EVENT_COLS = ["session_id", "timestamp", "focus_score"] + LEGACY_BOOL_COLS + ML_FEATURE_COLS

REPORT_COLS = ["session_id", "timestamp", "report_type", "score"]


def export_from_sqlite(db_path: str):
    """Read events and self-reports directly from SQLite."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Events
    cur = conn.execute("""
        SELECT session_id, timestamp, focus_score,
               is_tab_hidden, is_idle, is_face_missing, is_looking_away,
               head_yaw, head_pitch, head_roll,
               ear_left, ear_right, gaze_x, gaze_y, face_confidence,
               keystroke_rate, mouse_velocity, mouse_distance,
               click_rate, scroll_rate, idle_duration, activity_level,
               tab_switch_count, window_blur_count,
               time_since_tab_return, session_elapsed_ratio,
               focus_ema_30s, focus_ema_5min, focus_trend, distraction_burst_count
        FROM api_sessionevent
        ORDER BY timestamp
    """)
    rows = cur.fetchall()

    events_path = OUTPUT_DIR / "events.csv"
    with open(events_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(EVENT_COLS)
        for row in rows:
            writer.writerow([row[col] for col in EVENT_COLS])

    print(f"Exported {len(rows)} events → {events_path}")

    # Self-reports
    cur = conn.execute("""
        SELECT session_id, timestamp, report_type, score
        FROM api_selfreport
        ORDER BY timestamp
    """)
    rows = cur.fetchall()

    reports_path = OUTPUT_DIR / "self_reports.csv"
    with open(reports_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(REPORT_COLS)
        for row in rows:
            writer.writerow([row[col] for col in REPORT_COLS])

    print(f"Exported {len(rows)} self-reports → {reports_path}")
    conn.close()


def export_from_api(base_url: str, token: str):
    """Fetch via REST API (for production use)."""
    try:
        import requests
    except ImportError:
        print("pip install requests")
        sys.exit(1)

    headers = {"Authorization": f"Bearer {token}"}
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Events (JSON format)
    resp = requests.get(f"{base_url}/ml/export/?format=json", headers=headers)
    resp.raise_for_status()
    events = resp.json()

    events_path = OUTPUT_DIR / "events.csv"
    if events:
        with open(events_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=EVENT_COLS)
            writer.writeheader()
            for e in events:
                writer.writerow({col: e.get(col) for col in EVENT_COLS})

    print(f"Exported {len(events)} events → {events_path}")


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
