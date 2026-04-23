"""
Focus session views.

Provides list + create on the session collection, detail + patch + delete on
individual sessions, and a bulk event upload endpoint for each session.

Ownership is enforced at the query layer: every query filters by
``user=request.user`` so that a caller can only see or mutate their own data.
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.models import FocusSession
from api.serializers import (
    BulkEventSerializer,
    FocusSessionCreateSerializer,
    FocusSessionDetailSerializer,
    FocusSessionListSerializer,
    FocusSessionUpdateSerializer,
)


def _get_owned_session(user, pk):
    """
    Return the FocusSession with id ``pk`` if it belongs to ``user``.

    Raises FocusSession.DoesNotExist otherwise. Kept as a module-level helper
    so the three session views share a single code path for ownership checks.
    """
    return FocusSession.objects.get(pk=pk, user=user)


class SessionListCreateView(APIView):
    """List the caller's sessions (optionally filtered by date) or create a new one."""

    def get(self, request):
        # Only completed sessions (end_time is set) are listed. Incomplete
        # sessions — created but not yet ended — are invisible to the
        # dashboard and history pages, matching the analytics endpoint.
        qs = FocusSession.objects.filter(
            user=request.user, end_time__isnull=False,
        )

        date_from = request.query_params.get("from")
        date_to = request.query_params.get("to")
        if date_from:
            qs = qs.filter(start_time__date__gte=date_from)
        if date_to:
            qs = qs.filter(start_time__date__lte=date_to)

        return Response(FocusSessionListSerializer(qs, many=True).data)

    def post(self, request):
        serializer = FocusSessionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class SessionDetailView(APIView):
    """Retrieve, update, or delete a single session owned by the caller."""

    def get(self, request, pk):
        try:
            session = _get_owned_session(request.user, pk)
        except FocusSession.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(FocusSessionDetailSerializer(session).data)

    def patch(self, request, pk):
        try:
            session = _get_owned_session(request.user, pk)
        except FocusSession.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        serializer = FocusSessionUpdateSerializer(
            session, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(FocusSessionDetailSerializer(session).data)

    def delete(self, request, pk):
        try:
            session = _get_owned_session(request.user, pk)
        except FocusSession.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        session.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SessionEventsView(APIView):
    """Bulk-upload SessionEvents belonging to a session owned by the caller."""

    def post(self, request, pk):
        try:
            session = _get_owned_session(request.user, pk)
        except FocusSession.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        serializer = BulkEventSerializer(
            data=request.data, context={"session": session}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"count": len(serializer.validated_data["events"])},
            status=status.HTTP_201_CREATED,
        )
