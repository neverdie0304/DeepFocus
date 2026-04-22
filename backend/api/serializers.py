from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import FocusSession, SessionEvent, SelfReport

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'password')

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email')


class SessionEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = SessionEvent
        fields = (
            'id', 'timestamp', 'focus_score',
            # Legacy booleans
            'is_tab_hidden', 'is_idle', 'is_face_missing', 'is_looking_away',
            # Visual features
            'head_yaw', 'head_pitch', 'head_roll',
            'ear_left', 'ear_right', 'gaze_x', 'gaze_y', 'face_confidence',
            # Blendshapes
            'brow_down_left', 'brow_down_right', 'brow_inner_up',
            'eye_squint_left', 'eye_squint_right', 'eye_wide_left', 'eye_wide_right',
            'jaw_open', 'mouth_frown_left', 'mouth_frown_right',
            'mouth_smile_left', 'mouth_smile_right',
            # Behavioral features
            'keystroke_rate', 'mouse_velocity', 'mouse_distance',
            'click_rate', 'scroll_rate', 'idle_duration', 'activity_level',
            # Contextual features
            'tab_switch_count', 'window_blur_count',
            'time_since_tab_return', 'session_elapsed_ratio',
            # Temporal features
            'focus_ema_30s', 'focus_ema_5min', 'focus_trend',
            'distraction_burst_count',
        )


class BulkEventSerializer(serializers.Serializer):
    events = SessionEventSerializer(many=True)

    def create(self, validated_data):
        session = self.context['session']
        events = [
            SessionEvent(session=session, **evt)
            for evt in validated_data['events']
        ]
        return SessionEvent.objects.bulk_create(events)


class FocusSessionListSerializer(serializers.ModelSerializer):
    class Meta:
        model = FocusSession
        fields = (
            'id', 'start_time', 'end_time', 'duration', 'mode',
            'focus_score_final', 'tag', 'note',
        )


class FocusSessionDetailSerializer(serializers.ModelSerializer):
    events = SessionEventSerializer(many=True, read_only=True)

    class Meta:
        model = FocusSession
        fields = (
            'id', 'start_time', 'end_time', 'duration', 'mode',
            'focus_score_final', 'time_idle', 'time_tab_hidden',
            'time_face_missing', 'time_looking_away',
            'note', 'tag', 'events',
        )


class FocusSessionCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = FocusSession
        fields = ('id', 'start_time', 'mode')


class FocusSessionUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = FocusSession
        fields = (
            'end_time', 'duration', 'focus_score_final',
            'time_idle', 'time_tab_hidden',
            'time_face_missing', 'time_looking_away',
            'note', 'tag',
        )


class SelfReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = SelfReport
        fields = ('id', 'timestamp', 'report_type', 'score')
