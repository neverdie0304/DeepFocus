"""
Tests for weekly analytics aggregation: totals, per-day breakdown, heatmap.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from api.models import FocusSession, SessionEvent

User = get_user_model()


class WeeklyAnalyticsTests(APITestCase):
    url = "/api/analytics/weekly/"

    def setUp(self):
        self.user = User.objects.create_user(username="anna", password="pass12345")
        self.other = User.objects.create_user(username="ben", password="pass12345")
        self.client.force_authenticate(self.user)
        self.now = timezone.now()

    def _make_session(self, *, days_ago=0, duration=1200, score=80.0,
                      idle=60, tab=30, phone=0, user=None):
        start = self.now - timedelta(days=days_ago)
        return FocusSession.objects.create(
            user=user or self.user,
            start_time=start,
            end_time=start + timedelta(seconds=duration),
            duration=duration,
            focus_score_final=score,
            time_idle=idle,
            time_tab_hidden=tab,
            time_phone_use=phone,
        )

    def test_empty_response_when_no_sessions(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_sessions"], 0)
        self.assertIsNone(response.data["avg_score"])
        self.assertEqual(response.data["total_duration"], 0)

    def test_aggregate_totals(self):
        self._make_session(days_ago=1, duration=600, score=70)
        self._make_session(days_ago=2, duration=1200, score=90)
        response = self.client.get(self.url)
        self.assertEqual(response.data["total_sessions"], 2)
        self.assertEqual(response.data["total_duration"], 1800)
        self.assertAlmostEqual(response.data["avg_score"], 80.0, places=1)

    def test_distractions_summed(self):
        self._make_session(days_ago=1, idle=30, tab=10)
        self._make_session(days_ago=2, idle=45, tab=20)
        response = self.client.get(self.url)
        self.assertAlmostEqual(response.data["distractions"]["idle"], 75)
        self.assertAlmostEqual(response.data["distractions"]["tab_hidden"], 30)

    def test_distractions_include_phone_use_total(self):
        # Phone use is the newest distraction category; the dashboard
        # distractions list depends on the weekly analytics endpoint
        # surfacing it alongside idle, tab_hidden, face_missing, and
        # looking_away.
        self._make_session(days_ago=1, phone=40)
        self._make_session(days_ago=3, phone=25)
        response = self.client.get(self.url)
        self.assertIn("phone_use", response.data["distractions"])
        self.assertAlmostEqual(response.data["distractions"]["phone_use"], 65)

    def test_phone_use_defaults_to_zero_when_absent(self):
        self._make_session(days_ago=1)  # phone=0 by default
        response = self.client.get(self.url)
        self.assertEqual(response.data["distractions"]["phone_use"], 0)

    def test_excludes_other_users(self):
        self._make_session(days_ago=1, user=self.user)
        self._make_session(days_ago=1, user=self.other)
        response = self.client.get(self.url)
        self.assertEqual(response.data["total_sessions"], 1)

    def test_excludes_unfinished_sessions(self):
        FocusSession.objects.create(user=self.user, start_time=self.now)
        response = self.client.get(self.url)
        self.assertEqual(response.data["total_sessions"], 0)

    def test_daily_breakdown_has_seven_entries(self):
        response = self.client.get(self.url)
        self.assertEqual(len(response.data["daily"]), 7)

    def test_heatmap_includes_event_data(self):
        session = self._make_session(days_ago=1)
        SessionEvent.objects.create(
            session=session,
            timestamp=session.start_time,
            focus_score=75.0,
        )
        response = self.client.get(self.url)
        self.assertIsInstance(response.data["heatmap"], list)

    def test_requires_auth(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class MLExportTests(APITestCase):
    url = "/api/ml/export/"

    def setUp(self):
        self.user = User.objects.create_user(username="mia", password="pass12345")
        self.client.force_authenticate(self.user)
        session = FocusSession.objects.create(
            user=self.user, start_time=timezone.now()
        )
        SessionEvent.objects.create(
            session=session,
            timestamp=timezone.now(),
            focus_score=82.0,
            head_yaw=1.0,
            keystroke_rate=1.5,
        )

    def test_csv_export_default(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "text/csv")
        self.assertIn("attachment", response["Content-Disposition"])

    def test_json_export(self):
        response = self.client.get(self.url, {"format": "json"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 1)

    def test_excludes_other_users_data(self):
        other = User.objects.create_user(username="nia", password="pass12345")
        other_session = FocusSession.objects.create(
            user=other, start_time=timezone.now()
        )
        SessionEvent.objects.create(
            session=other_session,
            timestamp=timezone.now(),
            focus_score=50.0,
        )
        response = self.client.get(self.url, {"format": "json"})
        self.assertEqual(len(response.data), 1)
