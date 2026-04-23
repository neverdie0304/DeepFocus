"""
Tests for self-report (ground-truth) endpoints.
"""
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from api.models import FocusSession, SelfReport

User = get_user_model()


class SelfReportTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="sam", password="pass12345")
        self.session = FocusSession.objects.create(
            user=self.user, start_time=timezone.now()
        )
        self.client.force_authenticate(self.user)

    def _url(self, pk=None):
        return f"/api/sessions/{pk or self.session.id}/reports/"

    def test_submit_esm_report(self):
        response = self.client.post(self._url(), {
            "timestamp": timezone.now().isoformat(),
            "report_type": "esm",
            "score": 4,
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(SelfReport.objects.count(), 1)
        report = SelfReport.objects.first()
        self.assertEqual(report.report_type, "esm")
        self.assertEqual(report.score, 4)

    def test_submit_post_session_report(self):
        response = self.client.post(self._url(), {
            "timestamp": timezone.now().isoformat(),
            "report_type": "post_session",
            "score": 8,
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(SelfReport.objects.first().report_type, "post_session")

    def test_multiple_esm_reports(self):
        for score in [3, 4, 5]:
            self.client.post(self._url(), {
                "timestamp": timezone.now().isoformat(),
                "report_type": "esm",
                "score": score,
            })
        self.assertEqual(SelfReport.objects.count(), 3)

    def test_list_reports_for_session(self):
        SelfReport.objects.create(
            session=self.session,
            timestamp=timezone.now(),
            report_type="esm",
            score=3,
        )
        SelfReport.objects.create(
            session=self.session,
            timestamp=timezone.now(),
            report_type="post_session",
            score=7,
        )
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_cannot_submit_to_others_session(self):
        other = User.objects.create_user(username="tim", password="pass12345")
        other_session = FocusSession.objects.create(
            user=other, start_time=timezone.now()
        )
        response = self.client.post(self._url(pk=other_session.id), {
            "timestamp": timezone.now().isoformat(),
            "report_type": "esm",
            "score": 4,
        })
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
