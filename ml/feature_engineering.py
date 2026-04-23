"""
feature_engineering.py

Transforms the raw CSV exports from ``export_data.py`` into a training-ready
dataset. Responsibilities:

1. Fill missing values with domain-appropriate defaults.
2. Align ESM labels with the nearest event within a tolerance window.
3. Attach session-level post-session labels.
4. Z-score normalise feature columns and persist the scaler parameters
   (needed at inference time to apply the same normalisation in the
   browser).

Outputs:
  - ``ml/data/dataset.csv``: the normalised dataset.
  - ``ml/data/scaler_params.json``: mean/std per feature for inference.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from features import ALL_FEATURES, FILL_DEFAULTS, available_features
from paths import (
    DATASET_CSV,
    EVENTS_CSV,
    SCALER_PARAMS_JSON,
    SELF_REPORTS_CSV,
    ensure_dirs,
)

ESM_MATCH_WINDOW_SECONDS = 5.0


def load_events() -> pd.DataFrame:
    """Load events CSV and fill missing ML features with domain defaults."""
    if not EVENTS_CSV.exists():
        raise FileNotFoundError(f"Run export_data.py first: {EVENTS_CSV}")

    df = pd.read_csv(EVENTS_CSV, parse_dates=["timestamp"])
    for col, default in FILL_DEFAULTS.items():
        if col in df.columns:
            df[col] = df[col].fillna(default)
    return df


def load_self_reports() -> pd.DataFrame:
    """Load self-reports CSV, or return an empty frame if not present."""
    if not SELF_REPORTS_CSV.exists():
        return pd.DataFrame(columns=["session_id", "timestamp", "report_type", "score"])
    return pd.read_csv(SELF_REPORTS_CSV, parse_dates=["timestamp"])


def align_esm_labels(
    events: pd.DataFrame,
    reports: pd.DataFrame,
    window_sec: float = ESM_MATCH_WINDOW_SECONDS,
) -> pd.DataFrame:
    """
    Add an ``esm_score`` column to ``events`` by matching each ESM report
    to the nearest event in the same session within ``window_sec``.
    """
    events = events.copy()
    events["esm_score"] = np.nan

    esm = reports[reports["report_type"] == "esm"]
    if esm.empty:
        return events

    for _, report in esm.iterrows():
        session_events = events[events["session_id"] == report["session_id"]]
        if session_events.empty:
            continue

        time_diffs = (session_events["timestamp"] - report["timestamp"]).abs()
        min_idx = time_diffs.idxmin()
        min_diff_seconds = time_diffs[min_idx].total_seconds()

        if min_diff_seconds <= window_sec:
            events.loc[min_idx, "esm_score"] = report["score"]

    return events


def add_post_session_labels(
    events: pd.DataFrame, reports: pd.DataFrame,
) -> pd.DataFrame:
    """Attach each session's post-session score to all of its events."""
    events = events.copy()
    post = reports[reports["report_type"] == "post_session"]
    session_scores = post.groupby("session_id")["score"].mean().to_dict()
    events["post_session_score"] = events["session_id"].map(session_scores)
    return events


def normalise_features(
    df: pd.DataFrame, feature_cols: list[str],
) -> tuple[pd.DataFrame, dict]:
    """
    Z-score normalise ``feature_cols`` in place on a copy of ``df``.

    Returns the normalised frame and a dict mapping each column to
    {"mean": float, "std": float} for reuse at inference time.
    """
    df = df.copy()
    scaler_params: dict[str, dict[str, float]] = {}

    for col in feature_cols:
        if col not in df.columns:
            continue
        mean = df[col].mean()
        std = df[col].std() or 1.0
        df[col] = (df[col] - mean) / std
        scaler_params[col] = {"mean": float(mean), "std": float(std)}

    return df, scaler_params


def prepare_dataset() -> tuple[pd.DataFrame, dict]:
    """Full pipeline: load → clean → align labels → normalise → save."""
    ensure_dirs()

    print("Loading events...")
    events = load_events()
    print(f"  {len(events)} events loaded")

    print("Loading self-reports...")
    reports = load_self_reports()
    print(f"  {len(reports)} self-reports loaded")

    print("Aligning ESM labels...")
    events = align_esm_labels(events, reports)
    esm_labeled = int(events["esm_score"].notna().sum())
    print(f"  {esm_labeled} events with ESM labels")

    print("Adding post-session labels...")
    events = add_post_session_labels(events, reports)

    features = available_features(events)
    print(f"  {len(features)} ML features available")

    print("Normalising features...")
    events_norm, scaler_params = normalise_features(events, features)

    events_norm.to_csv(DATASET_CSV, index=False)
    print(f"  Saved normalised dataset → {DATASET_CSV}")

    with open(SCALER_PARAMS_JSON, "w") as f:
        json.dump(scaler_params, f, indent=2)
    print(f"  Saved scaler params → {SCALER_PARAMS_JSON}")

    print("\n── Dataset Summary ──")
    print(f"Total events:          {len(events_norm)}")
    print(f"Unique sessions:       {events_norm['session_id'].nunique()}")
    print(f"ESM-labeled events:    {esm_labeled}")
    print(
        "Sessions with post-SR: "
        f"{bool(events_norm['post_session_score'].notna().any())}",
    )
    print(f"Feature columns:       {len(features)}")

    return events_norm, scaler_params


if __name__ == "__main__":
    prepare_dataset()


# Backward-compatible re-exports so older consumers of this module still work.
VISUAL_FEATURES = available_features  # function alias
ALL_ML_FEATURES = ALL_FEATURES         # list alias
