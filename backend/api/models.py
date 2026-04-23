"""
Database models for the DeepFocus API.

Three core models capture the full lifecycle of a focus session:

- ``User`` is a thin subclass of Django's ``AbstractUser`` that allows room
  to add profile fields in future without a difficult migration.
- ``FocusSession`` represents one continuous focus session.
- ``SessionEvent`` is a 2-second sample within a session, carrying both the
  legacy boolean signals and the full 31-field ML feature vector.
- ``SelfReport`` stores human ground-truth ratings, either in-the-moment
  (ESM) or post-session.
"""
from __future__ import annotations

from django.contrib.auth.models import AbstractUser
from django.db import models

from api.constants import (
    MODE_CAMERA_OFF,
    MODE_CHOICES,
    NOTE_MAX_LENGTH,
    REPORT_TYPE_CHOICES,
    TAG_MAX_LENGTH,
)


class User(AbstractUser):
    """Application user. Extends Django's AbstractUser for forward compatibility."""

    pass


class FocusSession(models.Model):
    """
    A single focus session recorded by a user.

    A session is opened when the user clicks "Start", accumulates
    SessionEvents at 2-second intervals, and is closed when the user clicks
    "End" (or when the browser closes, in which case ``end_time`` and
    ``duration`` may remain null/zero until the user finalises it).
    """

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="sessions"
    )
    start_time = models.DateTimeField()
    end_time = models.DateTimeField(null=True, blank=True)
    duration = models.IntegerField(default=0, help_text="Duration in seconds.")

    mode = models.CharField(
        max_length=20, choices=MODE_CHOICES, default=MODE_CAMERA_OFF,
        help_text="Whether camera-based features are included.",
    )
    focus_score_final = models.FloatField(null=True, blank=True)

    # Cumulative distraction time (seconds) per category.
    time_idle = models.FloatField(default=0)
    time_tab_hidden = models.FloatField(default=0)
    time_face_missing = models.FloatField(default=0)
    time_looking_away = models.FloatField(default=0)

    note = models.CharField(max_length=NOTE_MAX_LENGTH, blank=True)
    tag = models.CharField(max_length=TAG_MAX_LENGTH, blank=True)

    class Meta:
        ordering = ["-start_time"]

    def __str__(self):
        return f"Session {self.id} - {self.user.username} @ {self.start_time}"


class SessionEvent(models.Model):
    """
    A 2-second sample within a focus session.

    Carries a focus score (0-100, either rule-based or ML-predicted) plus
    four boolean signals (retained for backward compatibility with the first
    iteration of the system) and the 31 continuous ML features used for
    model training and inference.

    Feature fields are all nullable because:
    - Visual features are null in camera-off mode.
    - All features may be null for events created before a given feature
      was added (database migrations only add the column, they do not
      back-fill values).
    """

    session = models.ForeignKey(
        FocusSession, on_delete=models.CASCADE, related_name="events"
    )
    timestamp = models.DateTimeField()
    focus_score = models.FloatField()

    # ── Legacy boolean signals (kept for backward compatibility) ──
    is_tab_hidden = models.BooleanField(default=False)
    is_idle = models.BooleanField(default=False)
    is_face_missing = models.BooleanField(default=False)
    is_looking_away = models.BooleanField(default=False)

    # ── Visual (Face Mesh geometry) ──
    head_yaw = models.FloatField(null=True, blank=True)
    head_pitch = models.FloatField(null=True, blank=True)
    head_roll = models.FloatField(null=True, blank=True)
    ear_left = models.FloatField(null=True, blank=True)
    ear_right = models.FloatField(null=True, blank=True)
    gaze_x = models.FloatField(null=True, blank=True)
    gaze_y = models.FloatField(null=True, blank=True)
    face_confidence = models.FloatField(null=True, blank=True)

    # ── Visual (Face Mesh blendshapes — engagement-relevant subset) ──
    brow_down_left = models.FloatField(null=True, blank=True)
    brow_down_right = models.FloatField(null=True, blank=True)
    brow_inner_up = models.FloatField(null=True, blank=True)
    eye_squint_left = models.FloatField(null=True, blank=True)
    eye_squint_right = models.FloatField(null=True, blank=True)
    eye_wide_left = models.FloatField(null=True, blank=True)
    eye_wide_right = models.FloatField(null=True, blank=True)
    jaw_open = models.FloatField(null=True, blank=True)
    mouth_frown_left = models.FloatField(null=True, blank=True)
    mouth_frown_right = models.FloatField(null=True, blank=True)
    mouth_smile_left = models.FloatField(null=True, blank=True)
    mouth_smile_right = models.FloatField(null=True, blank=True)

    # ── Behavioural (30-second sliding window) ──
    keystroke_rate = models.FloatField(null=True, blank=True)
    mouse_velocity = models.FloatField(null=True, blank=True)
    mouse_distance = models.FloatField(null=True, blank=True)
    click_rate = models.FloatField(null=True, blank=True)
    scroll_rate = models.FloatField(null=True, blank=True)
    idle_duration = models.FloatField(null=True, blank=True)
    activity_level = models.FloatField(null=True, blank=True)

    # ── Contextual (5-minute window + session progress) ──
    tab_switch_count = models.IntegerField(null=True, blank=True)
    window_blur_count = models.IntegerField(null=True, blank=True)
    time_since_tab_return = models.FloatField(null=True, blank=True)
    session_elapsed_ratio = models.FloatField(null=True, blank=True)

    # ── Temporal (derived from the running focus-score stream) ──
    focus_ema_30s = models.FloatField(null=True, blank=True)
    focus_ema_5min = models.FloatField(null=True, blank=True)
    focus_trend = models.FloatField(null=True, blank=True)
    distraction_burst_count = models.IntegerField(null=True, blank=True)

    class Meta:
        ordering = ["timestamp"]


class SelfReport(models.Model):
    """
    A human-provided ground-truth focus rating.

    Two types of report are supported:
    - ``esm``: Experience Sampling Method — a rating captured during the
      session via a brief popup, on a 1–5 scale.
    - ``post_session``: an overall rating captured after the session ends,
      on a 1–10 scale.
    """

    session = models.ForeignKey(
        FocusSession, on_delete=models.CASCADE, related_name="self_reports"
    )
    timestamp = models.DateTimeField()
    report_type = models.CharField(max_length=20, choices=REPORT_TYPE_CHOICES)
    score = models.IntegerField()

    class Meta:
        ordering = ["timestamp"]
