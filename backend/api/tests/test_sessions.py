"""
Tests for session endpoints: list, create, retrieve, update, delete,
and bulk event upload. Verifies ownership enforcement and correct
handling of ML feature fields.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from api.models import FocusSession, SessionEvent

User = get_user_model()


class SessionListCreateTests(APITestCase):
    url = "/api/sessions/"

    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="pass12345")
        self.other = User.objects.create_user(username="bob", password="pass12345")
        self.client.force_authenticate(self.user)

    def test_list_returns_only_own_completed_sessions(self):
        # Two completed sessions for self.user (end_time set).
        FocusSession.objects.create(
            user=self.user, start_time=timezone.now(), end_time=timezone.now(),
        )
        FocusSession.objects.create(
            user=self.user, start_time=timezone.now(), end_time=timezone.now(),
        )
        # One for another user (should be excluded by ownership).
        FocusSession.objects.create(
            user=self.other, start_time=timezone.now(), end_time=timezone.now(),
        )
        # One incomplete session for self.user (should be excluded by
        # the new end_time__isnull=False filter).
        FocusSession.objects.create(user=self.user, start_time=timezone.now())

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_list_excludes_incomplete_sessions(self):
        # A session created but never ended (no end_time) is invisible.
        FocusSession.objects.create(user=self.user, start_time=timezone.now())
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

    def test_list_date_range_filter(self):
        now = timezone.now()
        FocusSession.objects.create(
            user=self.user,
            start_time=now - timedelta(days=10),
            end_time=now - timedelta(days=10),
        )
        FocusSession.objects.create(
            user=self.user, start_time=now, end_time=now,
        )

        yesterday = (now - timedelta(days=1)).date().isoformat()
        response = self.client.get(self.url, {"from": yesterday})
        self.assertEqual(len(response.data), 1)

    def test_create_session(self):
        response = self.client.post(self.url, {
            "start_time": timezone.now().isoformat(),
            "mode": "camera_on",
            "tag": "coding",
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        session = FocusSession.objects.get(pk=response.data["id"])
        self.assertEqual(session.user, self.user)
        self.assertEqual(session.mode, "camera_on")
        self.assertEqual(session.tag, "coding")

    def test_create_session_without_tag(self):
        response = self.client.post(self.url, {
            "start_time": timezone.now().isoformat(),
            "mode": "camera_off",
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_list_requires_auth(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class SessionDetailTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="carol", password="pass12345")
        self.other = User.objects.create_user(username="dave", password="pass12345")
        self.session = FocusSession.objects.create(
            user=self.user, start_time=timezone.now()
        )
        self.client.force_authenticate(self.user)

    def _url(self, pk=None):
        return f"/api/sessions/{pk or self.session.id}/"

    def test_get_own_session(self):
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.session.id)

    def test_get_session_not_found(self):
        response = self.client.get(self._url(pk=99999))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_access_others_session(self):
        other_session = FocusSession.objects.create(
            user=self.other, start_time=timezone.now()
        )
        response = self.client.get(self._url(pk=other_session.id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_patch_updates_fields(self):
        response = self.client.patch(self._url(), {
            "end_time": timezone.now().isoformat(),
            "duration": 1200,
            "focus_score_final": 78.5,
            "note": "productive session",
            "tag": "coding",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.session.refresh_from_db()
        self.assertEqual(self.session.duration, 1200)
        self.assertAlmostEqual(self.session.focus_score_final, 78.5)
        self.assertEqual(self.session.note, "productive session")

    def test_patch_partial_update(self):
        self.session.duration = 600
        self.session.save()
        response = self.client.patch(self._url(), {"note": "updated"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.session.refresh_from_db()
        self.assertEqual(self.session.duration, 600)
        self.assertEqual(self.session.note, "updated")

    def test_cannot_patch_others_session(self):
        other_session = FocusSession.objects.create(
            user=self.other, start_time=timezone.now()
        )
        response = self.client.patch(self._url(pk=other_session.id), {"note": "hack"})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_own_session(self):
        response = self.client.delete(self._url())
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(FocusSession.objects.filter(pk=self.session.id).exists())

    def test_cannot_delete_others_session(self):
        other_session = FocusSession.objects.create(
            user=self.other, start_time=timezone.now()
        )
        response = self.client.delete(self._url(pk=other_session.id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(FocusSession.objects.filter(pk=other_session.id).exists())


class EventUploadTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="erin", password="pass12345")
        self.session = FocusSession.objects.create(
            user=self.user, start_time=timezone.now()
        )
        self.client.force_authenticate(self.user)

    def _url(self, pk=None):
        return f"/api/sessions/{pk or self.session.id}/events/"

    def test_upload_single_event(self):
        response = self.client.post(self._url(), {
            "events": [{
                "timestamp": timezone.now().isoformat(),
                "focus_score": 85.0,
                "is_tab_hidden": False,
                "is_idle": False,
                "is_face_missing": False,
                "is_looking_away": False,
            }],
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(SessionEvent.objects.count(), 1)

    def test_upload_bulk_events(self):
        events = [{
            "timestamp": timezone.now().isoformat(),
            "focus_score": 50.0 + i,
        } for i in range(25)]
        response = self.client.post(self._url(), {"events": events}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["count"], 25)
        self.assertEqual(SessionEvent.objects.count(), 25)

    def test_upload_events_with_ml_features(self):
        response = self.client.post(self._url(), {
            "events": [{
                "timestamp": timezone.now().isoformat(),
                "focus_score": 90.0,
                "head_yaw": 1.2,
                "head_pitch": -2.3,
                "ear_left": 0.29,
                "ear_right": 0.30,
                "keystroke_rate": 2.5,
                "mouse_velocity": 150.0,
                "tab_switch_count": 1,
                "focus_ema_30s": 88.5,
                "brow_down_left": 0.05,
                "mouth_smile_right": 0.1,
            }],
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        event = SessionEvent.objects.first()
        self.assertAlmostEqual(event.head_yaw, 1.2)
        self.assertAlmostEqual(event.keystroke_rate, 2.5)
        self.assertEqual(event.tab_switch_count, 1)

    def test_cannot_upload_to_others_session(self):
        other = User.objects.create_user(username="frank", password="pass12345")
        other_session = FocusSession.objects.create(
            user=other, start_time=timezone.now()
        )
        response = self.client.post(self._url(pk=other_session.id), {
            "events": [{"timestamp": timezone.now().isoformat(), "focus_score": 50}],
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(SessionEvent.objects.count(), 0)

    def test_reject_invalid_event_schema(self):
        response = self.client.post(self._url(), {
            "events": [{"not_a_field": "bad"}],
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
