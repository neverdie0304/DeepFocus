"""
ml/features.py

Single source of truth for the ML feature schema.

Every script in the offline pipeline imports the feature lists from this
module so that adding or removing a feature requires only one change.
Changes here must stay in sync with:

- ``backend/api/models.py::SessionEvent`` (the schema stored in the database),
- ``backend/api/serializers.py::SessionEventSerializer`` (what the API accepts),
- ``frontend/src/utils/scoring.js::assembleFeatureVector`` (what the client emits).
"""
from __future__ import annotations

# ──────────────────────────────────────────────────────────────────
# Feature groups (ordered consistently with the thesis Chapter 3)
# ──────────────────────────────────────────────────────────────────

VISUAL_GEOMETRY: list[str] = [
    "head_yaw", "head_pitch", "head_roll",
    "ear_left", "ear_right",
    "gaze_x", "gaze_y",
    "face_confidence",
]

VISUAL_OBJECT: list[str] = [
    # Phone detection (MediaPipe EfficientDet-Lite0, COCO cell phone class).
    "phone_confidence",
]

VISUAL_BLENDSHAPES: list[str] = [
    "brow_down_left", "brow_down_right", "brow_inner_up",
    "eye_squint_left", "eye_squint_right",
    "eye_wide_left", "eye_wide_right",
    "jaw_open",
    "mouth_frown_left", "mouth_frown_right",
    "mouth_smile_left", "mouth_smile_right",
]

VISUAL: list[str] = VISUAL_GEOMETRY + VISUAL_OBJECT + VISUAL_BLENDSHAPES

BEHAVIORAL: list[str] = [
    "keystroke_rate",
    "mouse_velocity", "mouse_distance",
    "click_rate", "scroll_rate",
    "idle_duration", "activity_level",
]

CONTEXTUAL: list[str] = [
    "tab_switch_count", "window_blur_count",
    "time_since_tab_return", "session_elapsed_ratio",
]

TEMPORAL: list[str] = [
    "focus_ema_30s", "focus_ema_5min",
    "focus_trend", "distraction_burst_count",
]

ALL_FEATURES: list[str] = VISUAL + BEHAVIORAL + CONTEXTUAL + TEMPORAL

# Legacy boolean signals (retained for backward compatibility; not used by
# the ML model but present in exported CSVs).
LEGACY_BOOLEANS: list[str] = [
    "is_tab_hidden", "is_idle", "is_face_missing", "is_looking_away",
    "is_phone_present",
]

# Default fill values per feature, applied during cleaning when a row is
# missing the value (e.g. visual features are null in camera-off mode).
FILL_DEFAULTS: dict[str, float] = {
    # Visual geometry — neutral pose / closed-eye baseline.
    "head_yaw": 0.0, "head_pitch": 0.0, "head_roll": 0.0,
    "ear_left": 0.3, "ear_right": 0.3,
    "gaze_x": 0.0, "gaze_y": 0.0,
    "face_confidence": 0.0,
    # Object detection — 0 means no phone detected.
    "phone_confidence": 0.0,
    # Blendshapes — 0 means no activation.
    **{f: 0.0 for f in VISUAL_BLENDSHAPES},
    # Behavioural — 0 activity.
    "keystroke_rate": 0.0, "mouse_velocity": 0.0, "mouse_distance": 0.0,
    "click_rate": 0.0, "scroll_rate": 0.0,
    "idle_duration": 0.0, "activity_level": 0.0,
    # Contextual.
    "tab_switch_count": 0.0, "window_blur_count": 0.0,
    "time_since_tab_return": 0.0, "session_elapsed_ratio": 0.0,
    # Temporal — neutral "fully focused" start.
    "focus_ema_30s": 100.0, "focus_ema_5min": 100.0,
    "focus_trend": 0.0, "distraction_burst_count": 0.0,
}

# Feature subsets used by the ablation study in ``evaluate.py``.
ABLATION_FEATURE_SETS: dict[str, list[str]] = {
    "visual_only": VISUAL,
    "behavioral_only": BEHAVIORAL,
    "contextual_only": CONTEXTUAL,
    "temporal_only": TEMPORAL,
    "visual+behavioral": VISUAL + BEHAVIORAL,
    "all_features": ALL_FEATURES,
}


def available_features(df) -> list[str]:
    """Return features from ``ALL_FEATURES`` that are present in ``df``."""
    return [f for f in ALL_FEATURES if f in df.columns]
