"""
DRF serializers for the DeepFocus API.

Organised in three groups:

- **Auth**: RegisterSerializer, UserSerializer.
- **Session**: a family of serializers for different session lifecycle
  operations. List/Detail for reads, Create/Update for writes. Separating
  read and write shapes keeps the write payloads small and prevents
  clients from setting server-controlled fields.
- **Events**: SessionEventSerializer and its bulk wrapper.
- **Self-reports**: SelfReportSerializer.

Constants shared with the models (e.g. minimum password length) are imported
from ``api.constants``.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import serializers

from api.constants import MIN_PASSWORD_LENGTH
from api.models import FocusSession, SelfReport, SessionEvent

User = get_user_model()


# ──────────────────────────────────────────────────────────────────
# Authentication
# ──────────────────────────────────────────────────────────────────


class RegisterSerializer(serializers.ModelSerializer):
    """Serializer for creating new accounts. Uses create_user to hash password."""

    password = serializers.CharField(write_only=True, min_length=MIN_PASSWORD_LENGTH)

    class Meta:
        model = User
        fields = ("id", "username", "email", "password")

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class UserSerializer(serializers.ModelSerializer):
    """Read-only representation of the authenticated user."""

    class Meta:
        model = User
        fields = ("id", "username", "email")


# ──────────────────────────────────────────────────────────────────
# Session events
# ──────────────────────────────────────────────────────────────────


# Fields listed in one place so it is trivial to add or remove a feature
# without touching read/write endpoints separately. The order follows the
# modality grouping described in the thesis Chapter 3.
_SESSION_EVENT_FIELDS = (
    "id", "timestamp", "focus_score",
    # Legacy boolean signals
    "is_tab_hidden", "is_idle", "is_face_missing", "is_looking_away",
    "is_phone_present",
    # Visual (geometry)
    "head_yaw", "head_pitch", "head_roll",
    "ear_left", "ear_right", "gaze_x", "gaze_y", "face_confidence",
    # Visual (object detection)
    "phone_confidence",
    # Visual (blendshapes)
    "brow_down_left", "brow_down_right", "brow_inner_up",
    "eye_squint_left", "eye_squint_right", "eye_wide_left", "eye_wide_right",
    "jaw_open", "mouth_frown_left", "mouth_frown_right",
    "mouth_smile_left", "mouth_smile_right",
    # Behavioural
    "keystroke_rate", "mouse_velocity", "mouse_distance",
    "click_rate", "scroll_rate", "idle_duration", "activity_level",
    # Contextual
    "tab_switch_count", "window_blur_count",
    "time_since_tab_return", "session_elapsed_ratio",
    # Temporal
    "focus_ema_30s", "focus_ema_5min", "focus_trend",
    "distraction_burst_count",
)


class SessionEventSerializer(serializers.ModelSerializer):
    """Full read/write representation of a SessionEvent."""

    class Meta:
        model = SessionEvent
        fields = _SESSION_EVENT_FIELDS


class BulkEventSerializer(serializers.Serializer):
    """
    Wrapper that accepts a batch of events under an ``events`` key and
    persists them with a single INSERT via ``bulk_create``. The parent
    session is provided via serializer context.
    """

    events = SessionEventSerializer(many=True)

    def create(self, validated_data):
        session = self.context["session"]
        events = [
            SessionEvent(session=session, **evt)
            for evt in validated_data["events"]
        ]
        return SessionEvent.objects.bulk_create(events)


# ──────────────────────────────────────────────────────────────────
# Focus sessions
# ──────────────────────────────────────────────────────────────────


class FocusSessionListSerializer(serializers.ModelSerializer):
    """Compact representation for the sessions list endpoint."""

    class Meta:
        model = FocusSession
        fields = (
            "id", "start_time", "end_time", "duration", "mode",
            "focus_score_final", "tag", "note",
        )


class FocusSessionDetailSerializer(serializers.ModelSerializer):
    """Full session representation with nested events, for the detail endpoint."""

    events = SessionEventSerializer(many=True, read_only=True)

    class Meta:
        model = FocusSession
        fields = (
            "id", "start_time", "end_time", "duration", "mode",
            "focus_score_final", "time_idle", "time_tab_hidden",
            "time_face_missing", "time_looking_away", "time_phone_use",
            "note", "tag", "events",
        )


class FocusSessionCreateSerializer(serializers.ModelSerializer):
    """
    Minimal session representation for session creation.

    Only accepts fields the client should control at session start; user is
    attached server-side via ``serializer.save(user=request.user)``.
    """

    class Meta:
        model = FocusSession
        fields = ("id", "start_time", "mode", "tag")


class FocusSessionUpdateSerializer(serializers.ModelSerializer):
    """
    Partial-update representation for ending or annotating a session.

    Notably excludes ``start_time`` and ``mode`` so they cannot be rewritten
    after the fact.
    """

    class Meta:
        model = FocusSession
        fields = (
            "end_time", "duration", "focus_score_final",
            "time_idle", "time_tab_hidden",
            "time_face_missing", "time_looking_away", "time_phone_use",
            "note", "tag",
        )


# ──────────────────────────────────────────────────────────────────
# Self-reports
# ──────────────────────────────────────────────────────────────────


class SelfReportSerializer(serializers.ModelSerializer):
    """Read/write representation of a SelfReport. Session is attached server-side."""

    class Meta:
        model = SelfReport
        fields = ("id", "timestamp", "report_type", "score")
