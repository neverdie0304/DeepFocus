"""
api/constants.py

Central location for constants shared across the API layer. Extracted from
inline literals in views and serializers to make maintenance and tuning
easier.
"""
from __future__ import annotations

# ──────────────────────────────────────────────────────────────────
# Session mode choices
# ──────────────────────────────────────────────────────────────────

MODE_CAMERA_ON = "camera_on"
MODE_CAMERA_OFF = "camera_off"

MODE_CHOICES = [
    (MODE_CAMERA_ON, "Camera On"),
    (MODE_CAMERA_OFF, "Camera Off"),
]

# ──────────────────────────────────────────────────────────────────
# Self-report types
# ──────────────────────────────────────────────────────────────────

REPORT_TYPE_ESM = "esm"
REPORT_TYPE_POST_SESSION = "post_session"

REPORT_TYPE_CHOICES = [
    (REPORT_TYPE_ESM, "Experience Sampling"),
    (REPORT_TYPE_POST_SESSION, "Post-Session"),
]

# ──────────────────────────────────────────────────────────────────
# Validation thresholds
# ──────────────────────────────────────────────────────────────────

MIN_PASSWORD_LENGTH = 8

NOTE_MAX_LENGTH = 200
TAG_MAX_LENGTH = 50

# ──────────────────────────────────────────────────────────────────
# Analytics
# ──────────────────────────────────────────────────────────────────

HOURS_IN_DAY = 24
DAYS_IN_WEEK = 7
