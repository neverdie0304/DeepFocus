"""
feature_engineering.py — Load raw CSV exports, clean data, handle missing values,
align ESM labels with events, and produce train-ready datasets.

Usage:
    python feature_engineering.py
"""

import numpy as np
import pandas as pd
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"

# ── Feature groups ──
VISUAL_FEATURES = [
    "head_yaw", "head_pitch", "head_roll",
    "ear_left", "ear_right", "gaze_x", "gaze_y", "face_confidence",
]
BEHAVIORAL_FEATURES = [
    "keystroke_rate", "mouse_velocity", "mouse_distance",
    "click_rate", "scroll_rate", "idle_duration", "activity_level",
]
CONTEXTUAL_FEATURES = [
    "tab_switch_count", "window_blur_count",
    "time_since_tab_return", "session_elapsed_ratio",
]
TEMPORAL_FEATURES = [
    "focus_ema_30s", "focus_ema_5min", "focus_trend", "distraction_burst_count",
]
ALL_ML_FEATURES = VISUAL_FEATURES + BEHAVIORAL_FEATURES + CONTEXTUAL_FEATURES + TEMPORAL_FEATURES
LEGACY_BOOLEANS = ["is_tab_hidden", "is_idle", "is_face_missing", "is_looking_away"]


def load_events() -> pd.DataFrame:
    """Load and clean the events CSV."""
    path = DATA_DIR / "events.csv"
    if not path.exists():
        raise FileNotFoundError(f"Run export_data.py first: {path}")

    df = pd.read_csv(path, parse_dates=["timestamp"])

    # Fill missing ML features with defaults
    fill_defaults = {
        # Visual: null means camera off → treat as 0 / neutral
        "head_yaw": 0, "head_pitch": 0, "head_roll": 0,
        "ear_left": 0.3, "ear_right": 0.3,
        "gaze_x": 0, "gaze_y": 0, "face_confidence": 0,
        # Behavioral
        "keystroke_rate": 0, "mouse_velocity": 0, "mouse_distance": 0,
        "click_rate": 0, "scroll_rate": 0, "idle_duration": 0, "activity_level": 0,
        # Contextual
        "tab_switch_count": 0, "window_blur_count": 0,
        "time_since_tab_return": 0, "session_elapsed_ratio": 0,
        # Temporal
        "focus_ema_30s": 100, "focus_ema_5min": 100, "focus_trend": 0,
        "distraction_burst_count": 0,
    }
    for col, default in fill_defaults.items():
        if col in df.columns:
            df[col] = df[col].fillna(default)

    return df


def load_self_reports() -> pd.DataFrame:
    """Load self-report labels."""
    path = DATA_DIR / "self_reports.csv"
    if not path.exists():
        return pd.DataFrame(columns=["session_id", "timestamp", "report_type", "score"])

    return pd.read_csv(path, parse_dates=["timestamp"])


def align_esm_labels(events: pd.DataFrame, reports: pd.DataFrame, window_sec: float = 5.0) -> pd.DataFrame:
    """
    Align ESM self-reports with the nearest event within ±window_sec.
    Adds 'esm_score' column (NaN where no label is available).
    """
    events = events.copy()
    events["esm_score"] = np.nan

    esm = reports[reports["report_type"] == "esm"].copy()
    if esm.empty:
        return events

    for _, report in esm.iterrows():
        session_mask = events["session_id"] == report["session_id"]
        session_events = events[session_mask]
        if session_events.empty:
            continue

        time_diffs = (session_events["timestamp"] - report["timestamp"]).abs()
        min_idx = time_diffs.idxmin()
        min_diff = time_diffs[min_idx].total_seconds()

        if min_diff <= window_sec:
            events.loc[min_idx, "esm_score"] = report["score"]

    return events


def add_post_session_labels(events: pd.DataFrame, reports: pd.DataFrame) -> pd.DataFrame:
    """
    Adds session-level 'post_session_score' column from post-session reports.
    Each event in a session inherits that session's post-session rating.
    """
    events = events.copy()
    post = reports[reports["report_type"] == "post_session"]

    session_scores = post.groupby("session_id")["score"].mean().to_dict()
    events["post_session_score"] = events["session_id"].map(session_scores)
    return events


def normalise_features(df: pd.DataFrame, feature_cols: list) -> tuple[pd.DataFrame, dict]:
    """
    Z-score normalisation. Returns normalised df and scaler params
    (mean, std per feature) for inference-time use.
    """
    scaler_params = {}
    df = df.copy()
    for col in feature_cols:
        if col not in df.columns:
            continue
        mean = df[col].mean()
        std = df[col].std()
        if std == 0:
            std = 1
        df[col] = (df[col] - mean) / std
        scaler_params[col] = {"mean": float(mean), "std": float(std)}
    return df, scaler_params


def prepare_dataset():
    """Full pipeline: load → clean → align → normalise → save."""
    print("Loading events...")
    events = load_events()
    print(f"  {len(events)} events loaded")

    print("Loading self-reports...")
    reports = load_self_reports()
    print(f"  {len(reports)} self-reports loaded")

    print("Aligning ESM labels...")
    events = align_esm_labels(events, reports)
    esm_labeled = events["esm_score"].notna().sum()
    print(f"  {esm_labeled} events with ESM labels")

    print("Adding post-session labels...")
    events = add_post_session_labels(events, reports)

    # Determine which features exist in data
    available_features = [c for c in ALL_ML_FEATURES if c in events.columns]
    print(f"  {len(available_features)} ML features available")

    print("Normalising features...")
    events_norm, scaler_params = normalise_features(events, available_features)

    # Save
    output_path = DATA_DIR / "dataset.csv"
    events_norm.to_csv(output_path, index=False)
    print(f"  Saved normalised dataset → {output_path}")

    # Save scaler params for inference
    import json
    scaler_path = DATA_DIR / "scaler_params.json"
    with open(scaler_path, "w") as f:
        json.dump(scaler_params, f, indent=2)
    print(f"  Saved scaler params → {scaler_path}")

    # Summary stats
    print("\n── Dataset Summary ──")
    print(f"Total events:          {len(events_norm)}")
    print(f"Unique sessions:       {events_norm['session_id'].nunique()}")
    print(f"ESM-labeled events:    {esm_labeled}")
    print(f"Sessions with post-SR: {events_norm['post_session_score'].notna().any()}")
    print(f"Feature columns:       {len(available_features)}")

    return events_norm, scaler_params


if __name__ == "__main__":
    prepare_dataset()
