"""
Weekly analytics view.

Aggregates the user's focus sessions for a given week into:

- overall totals (session count, average score, total duration, distractions),
- a daily breakdown (seven entries, one per day of the week),
- a per-hour heatmap (entries where at least one event exists for that hour).

The week is defined Monday–Sunday, derived from the optional ``date``
query parameter (defaulting to today).

Implementation notes
--------------------
Both the daily breakdown and the hourly heatmap are computed with a single
``GROUP BY`` query each, using Django's ``TruncDate`` and ``ExtractHour``
database functions. An earlier implementation looped over seven days (and
for the heatmap, over twenty-four hours within each day) issuing one
aggregate query per iteration — a classic N+1 pattern that produced 175+
round trips per dashboard load.
"""
from __future__ import annotations

from datetime import date as dt_date, timedelta

from django.db.models import Avg, Count, Sum
from django.db.models.functions import ExtractHour, TruncDate
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from api.constants import DAYS_IN_WEEK
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
            total_phone_use=Sum("time_phone_use"),
        )

        daily = self._daily_breakdown(sessions, start_of_week)
        heatmap = self._hourly_heatmap(
            request.user, start_of_week, end_of_week,
        )

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
                "phone_use": totals["total_phone_use"] or 0,
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
        """
        Return seven daily summaries using a single aggregation query.

        Uses ``TruncDate('start_time')`` to bucket sessions by calendar date
        and ``GROUP BY`` in the database rather than looping in Python.
        """
        rows = (
            sessions
            .annotate(day=TruncDate("start_time"))
            .values("day")
            .annotate(
                count=Count("id"),
                avg_score=Avg("focus_score_final"),
                total_duration=Sum("duration"),
            )
        )
        by_day = {row["day"]: row for row in rows}

        daily = []
        for i in range(DAYS_IN_WEEK):
            day = start_of_week + timedelta(days=i)
            row = by_day.get(day)
            daily.append({
                "date": day.isoformat(),
                "sessions": row["count"] if row else 0,
                "avg_score": row["avg_score"] if row else None,
                "total_duration": row["total_duration"] if row else 0,
            })
        return daily

    @staticmethod
    def _hourly_heatmap(user, start_of_week, end_of_week):
        """
        Return per-day-per-hour score averages using a single query.

        Groups events by ``session.start_time::date`` (to preserve the
        session's wall-clock day) and ``timestamp::hour``, then maps the
        date back to a 0–6 day-of-week index relative to Monday.
        """
        rows = (
            SessionEvent.objects
            .filter(
                session__user=user,
                session__start_time__date__gte=start_of_week,
                session__start_time__date__lte=end_of_week,
            )
            .annotate(
                session_date=TruncDate("session__start_time"),
                event_hour=ExtractHour("timestamp"),
            )
            .values("session_date", "event_hour")
            .annotate(avg=Avg("focus_score"))
            .order_by("session_date", "event_hour")
        )

        heatmap = []
        for row in rows:
            day_idx = (row["session_date"] - start_of_week).days
            if 0 <= day_idx < DAYS_IN_WEEK and row["avg"] is not None:
                heatmap.append({
                    "day": day_idx,
                    "hour": row["event_hour"],
                    "score": round(row["avg"], 1),
                })
        return heatmap
