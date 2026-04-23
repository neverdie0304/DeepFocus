"""
Tests for models: User, FocusSession, SessionEvent, SelfReport.
Validates field defaults, relationships, cascading delete, and ordering.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from api.models import FocusSession, SessionEvent, SelfReport

User = get_user_model()


class UserModelTests(TestCase):
    def test_create_user(self):
        user = User.objects.create_user(
            username="alice", email="alice@example.com", password="pass12345"
        )
        self.assertEqual(user.username, "alice")
        self.assertTrue(user.check_password("pass12345"))
        self.assertFalse(user.check_password("wrong"))

    def test_password_is_hashed(self):
        user = User.objects.create_user(username="bob", password="plaintext12345")
        self.assertNotEqual(user.password, "plaintext12345")
        self.assertTrue(user.password.startswith("pbkdf2_"))


class FocusSessionModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="carol", password="pass12345")

    def test_create_session_defaults(self):
        session = FocusSession.objects.create(
            user=self.user, start_time=timezone.now()
        )
        self.assertEqual(session.duration, 0)
        self.assertEqual(session.mode, "camera_off")
        self.assertIsNone(session.end_time)
        self.assertIsNone(session.focus_score_final)
        self.assertEqual(session.time_idle, 0)
        self.assertEqual(session.time_tab_hidden, 0)
        self.assertEqual(session.tag, "")
        self.assertEqual(session.note, "")

    def test_mode_choices(self):
        session = FocusSession.objects.create(
            user=self.user, start_time=timezone.now(), mode="camera_on"
        )
        self.assertEqual(session.mode, "camera_on")

    def test_ordering_newest_first(self):
        now = timezone.now()
        older = FocusSession.objects.create(
            user=self.user, start_time=now - timedelta(hours=2)
        )
        newer = FocusSession.objects.create(
            user=self.user, start_time=now - timedelta(hours=1)
        )
        sessions = list(FocusSession.objects.all())
        self.assertEqual(sessions[0].id, newer.id)
        self.assertEqual(sessions[1].id, older.id)

    def test_str_representation(self):
        session = FocusSession.objects.create(
            user=self.user, start_time=timezone.now()
        )
        self.assertIn("carol", str(session))
        self.assertIn(str(session.id), str(session))


class SessionEventModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="dave", password="pass12345")
        self.session = FocusSession.objects.create(
            user=self.user, start_time=timezone.now()
        )

    def test_create_event_minimal(self):
        event = SessionEvent.objects.create(
            session=self.session,
            timestamp=timezone.now(),
            focus_score=75.5,
        )
        self.assertEqual(event.focus_score, 75.5)
        self.assertFalse(event.is_tab_hidden)
        self.assertIsNone(event.head_yaw)

    def test_create_event_with_ml_features(self):
        event = SessionEvent.objects.create(
            session=self.session,
            timestamp=timezone.now(),
            focus_score=80.0,
            head_yaw=3.2,
            head_pitch=-5.1,
            ear_left=0.28,
            keystroke_rate=1.5,
            tab_switch_count=2,
            focus_ema_30s=78.3,
            brow_down_left=0.15,
        )
        self.assertAlmostEqual(event.head_yaw, 3.2)
        self.assertAlmostEqual(event.ear_left, 0.28)
        self.assertEqual(event.tab_switch_count, 2)

    def test_cascading_delete_from_session(self):
        SessionEvent.objects.create(
            session=self.session, timestamp=timezone.now(), focus_score=50.0
        )
        SessionEvent.objects.create(
            session=self.session, timestamp=timezone.now(), focus_score=60.0
        )
        self.assertEqual(SessionEvent.objects.count(), 2)
        self.session.delete()
        self.assertEqual(SessionEvent.objects.count(), 0)

    def test_cascading_delete_from_user(self):
        SessionEvent.objects.create(
            session=self.session, timestamp=timezone.now(), focus_score=50.0
        )
        self.user.delete()
        self.assertEqual(FocusSession.objects.count(), 0)
        self.assertEqual(SessionEvent.objects.count(), 0)

    def test_events_ordered_by_timestamp(self):
        now = timezone.now()
        e2 = SessionEvent.objects.create(
            session=self.session,
            timestamp=now + timedelta(seconds=4),
            focus_score=80.0,
        )
        e1 = SessionEvent.objects.create(
            session=self.session,
            timestamp=now + timedelta(seconds=2),
            focus_score=90.0,
        )
        events = list(self.session.events.all())
        self.assertEqual(events[0].id, e1.id)
        self.assertEqual(events[1].id, e2.id)


class SelfReportModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="eve", password="pass12345")
        self.session = FocusSession.objects.create(
            user=self.user, start_time=timezone.now()
        )

    def test_create_esm_report(self):
        report = SelfReport.objects.create(
            session=self.session,
            timestamp=timezone.now(),
            report_type="esm",
            score=4,
        )
        self.assertEqual(report.report_type, "esm")
        self.assertEqual(report.score, 4)

    def test_create_post_session_report(self):
        report = SelfReport.objects.create(
            session=self.session,
            timestamp=timezone.now(),
            report_type="post_session",
            score=8,
        )
        self.assertEqual(report.report_type, "post_session")

    def test_cascading_delete_from_session(self):
        SelfReport.objects.create(
            session=self.session,
            timestamp=timezone.now(),
            report_type="esm",
            score=3,
        )
        self.session.delete()
        self.assertEqual(SelfReport.objects.count(), 0)
