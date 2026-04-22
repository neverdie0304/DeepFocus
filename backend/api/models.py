from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    pass


class FocusSession(models.Model):
    MODE_CHOICES = [
        ('camera_on', 'Camera On'),
        ('camera_off', 'Camera Off'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sessions')
    start_time = models.DateTimeField()
    end_time = models.DateTimeField(null=True, blank=True)
    duration = models.IntegerField(default=0)
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default='camera_off')
    focus_score_final = models.FloatField(null=True, blank=True)
    time_idle = models.FloatField(default=0)
    time_tab_hidden = models.FloatField(default=0)
    time_face_missing = models.FloatField(default=0)
    time_looking_away = models.FloatField(default=0)
    note = models.CharField(max_length=200, blank=True)
    tag = models.CharField(max_length=50, blank=True)

    class Meta:
        ordering = ['-start_time']

    def __str__(self):
        return f"Session {self.id} - {self.user.username} @ {self.start_time}"


class SessionEvent(models.Model):
    session = models.ForeignKey(FocusSession, on_delete=models.CASCADE, related_name='events')
    timestamp = models.DateTimeField()
    focus_score = models.FloatField()

    # Legacy boolean signals (backward compatibility)
    is_tab_hidden = models.BooleanField(default=False)
    is_idle = models.BooleanField(default=False)
    is_face_missing = models.BooleanField(default=False)
    is_looking_away = models.BooleanField(default=False)

    # ── ML Features: Visual (Face Mesh) ──
    head_yaw = models.FloatField(null=True, blank=True)
    head_pitch = models.FloatField(null=True, blank=True)
    head_roll = models.FloatField(null=True, blank=True)
    ear_left = models.FloatField(null=True, blank=True)
    ear_right = models.FloatField(null=True, blank=True)
    gaze_x = models.FloatField(null=True, blank=True)
    gaze_y = models.FloatField(null=True, blank=True)
    face_confidence = models.FloatField(null=True, blank=True)

    # ── ML Features: Blendshapes (engagement-relevant) ──
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

    # ── ML Features: Behavioral ──
    keystroke_rate = models.FloatField(null=True, blank=True)
    mouse_velocity = models.FloatField(null=True, blank=True)
    mouse_distance = models.FloatField(null=True, blank=True)
    click_rate = models.FloatField(null=True, blank=True)
    scroll_rate = models.FloatField(null=True, blank=True)
    idle_duration = models.FloatField(null=True, blank=True)
    activity_level = models.FloatField(null=True, blank=True)

    # ── ML Features: Contextual ──
    tab_switch_count = models.IntegerField(null=True, blank=True)
    window_blur_count = models.IntegerField(null=True, blank=True)
    time_since_tab_return = models.FloatField(null=True, blank=True)
    session_elapsed_ratio = models.FloatField(null=True, blank=True)

    # ── ML Features: Temporal ──
    focus_ema_30s = models.FloatField(null=True, blank=True)
    focus_ema_5min = models.FloatField(null=True, blank=True)
    focus_trend = models.FloatField(null=True, blank=True)
    distraction_burst_count = models.IntegerField(null=True, blank=True)

    class Meta:
        ordering = ['timestamp']


class SelfReport(models.Model):
    REPORT_TYPE_CHOICES = [
        ('esm', 'Experience Sampling'),
        ('post_session', 'Post-Session'),
    ]

    session = models.ForeignKey(FocusSession, on_delete=models.CASCADE, related_name='self_reports')
    timestamp = models.DateTimeField()
    report_type = models.CharField(max_length=20, choices=REPORT_TYPE_CHOICES)
    score = models.IntegerField()  # 1-5 for ESM, 1-10 for post_session

    class Meta:
        ordering = ['timestamp']
