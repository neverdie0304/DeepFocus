"""
Weekly analytics view.

Aggregates the user's focus sessions for a given week into:

- overall totals (session count, average score, total duration, distractions),
- a daily breakdown (seven entries, one per day of the week),
- a per-hour heatmap (entries where at least one event exists for that hour).

The week is defined Monday–Sunday, derived from the optional ``date``
query parameter (defaulting to today).
"""
from __future__ import annotations

from datetime import date as dt_date, timedelta

from django.db.models import Avg, Count, Sum
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from api.constants import DAYS_IN_WEEK, HOURS_IN_DAY
from api.models import FocusSession, SessionEvent


class WeeklyAnalyticsView(APIView):
    """Return aggregate analytics for a Monday–Sunday week."""

    def get(self, request):
        start_of_week, end_of_week = self._resolve_week(
            request.query_params.get("date")
        )

        sessions = FocusSession.objects.filter(
            user=request.user,
            start_time__date__gte=start_of_week,
            start_time__date__lte=end_of_week,
            end_time__isnull=False,
        )

        totals = sessions.aggregate(
            total_sessions=Count("id"),
            avg_score=Avg("focus_score_final"),
            total_duration=Sum("duration"),
            total_idle=Sum("time_idle"),
            total_tab_hidden=Sum("time_tab_hidden"),
            total_face_missing=Sum("time_face_missing"),
            total_looking_away=Sum("time_looking_away"),
        )

        daily = self._daily_breakdown(sessions, start_of_week)
        heatmap = self._hourly_heatmap(request.user, start_of_week)

        return Response({
            "week_start": start_of_week.isoformat(),
            "week_end": end_of_week.isoformat(),
            "total_sessions": totals["total_sessions"],
            "avg_score": (
                round(totals["avg_score"], 1) if totals["avg_score"] else None
            ),
            "total_duration": totals["total_duration"] or 0,
            "distractions": {
                "idle": totals["total_idle"] or 0,
                "tab_hidden": totals["total_tab_hidden"] or 0,
                "face_missing": totals["total_face_missing"] or 0,
                "looking_away": totals["total_looking_away"] or 0,
            },
            "daily": daily,
            "heatmap": heatmap,
        })

    @staticmethod
    def _resolve_week(date_str):
        """Return (monday, sunday) for the week containing ``date_str`` or today."""
        ref = dt_date.fromisoformat(date_str) if date_str else timezone.now().date()
        start_of_week = ref - timedelta(days=ref.weekday())
        end_of_week = start_of_week + timedelta(days=DAYS_IN_WEEK - 1)
        return start_of_week, end_of_week

    @staticmethod
    def _daily_breakdown(sessions, start_of_week):
        """Return a list of seven daily summaries."""
        daily = []
        for i in range(DAYS_IN_WEEK):
            day = start_of_week + timedelta(days=i)
            agg = sessions.filter(start_time__date=day).aggregate(
                count=Count("id"),
                avg_score=Avg("focus_score_final"),
                total_duration=Sum("duration"),
            )
            daily.append({
                "date": day.isoformat(),
                "sessions": agg["count"],
                "avg_score": agg["avg_score"],
                "total_duration": agg["total_duration"] or 0,
            })
        return daily

    @staticmethod
    def _hourly_heatmap(user, start_of_week):
        """Return per-day-per-hour score averages (only where data exists)."""
        heatmap = []
        for i in range(DAYS_IN_WEEK):
            day = start_of_week + timedelta(days=i)
            day_events = SessionEvent.objects.filter(
                session__user=user,
                session__start_time__date=day,
            )
            for hour in range(HOURS_IN_DAY):
                avg = day_events.filter(timestamp__hour=hour).aggregate(
                    avg=Avg("focus_score"),
                )["avg"]
                if avg is not None:
                    heatmap.append({
                        "day": i,
                        "hour": hour,
                        "score": round(avg, 1),
                    })
        return heatmap
