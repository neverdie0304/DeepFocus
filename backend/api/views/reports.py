"""
Self-report (ground-truth) views.

A single endpoint handles both submission (POST) and retrieval (GET) of
self-reports attached to a session. Ownership is enforced via the parent
session.
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.models import FocusSession, SelfReport
from api.serializers import SelfReportSerializer


class SessionReportsView(APIView):
    """Submit or list self-reports for a session owned by the caller."""

    def _get_owned_session(self, request, pk):
        return FocusSession.objects.get(pk=pk, user=request.user)

    def post(self, request, pk):
        try:
            session = self._get_owned_session(request, pk)
        except FocusSession.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        serializer = SelfReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(session=session)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def get(self, request, pk):
        try:
            session = self._get_owned_session(request, pk)
        except FocusSession.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        reports = SelfReport.objects.filter(session=session)
        return Response(SelfReportSerializer(reports, many=True).data)
