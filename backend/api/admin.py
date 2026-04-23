"""Django admin registrations for DeepFocus models."""
from __future__ import annotations

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import FocusSession, SelfReport, SessionEvent, User


@admin.register(FocusSession)
class FocusSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "start_time", "duration", "mode", "focus_score_final", "tag")
    list_filter = ("mode", "tag")
    search_fields = ("user__username", "note")
    date_hierarchy = "start_time"
    ordering = ("-start_time",)


@admin.register(SessionEvent)
class SessionEventAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "timestamp", "focus_score")
    list_filter = ("is_tab_hidden", "is_idle", "is_face_missing", "is_looking_away")
    date_hierarchy = "timestamp"
    raw_id_fields = ("session",)


@admin.register(SelfReport)
class SelfReportAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "timestamp", "report_type", "score")
    list_filter = ("report_type",)
    date_hierarchy = "timestamp"
    raw_id_fields = ("session",)


admin.site.register(User, UserAdmin)
