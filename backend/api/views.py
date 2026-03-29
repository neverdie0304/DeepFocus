import csv
import io
from datetime import timedelta

from django.http import HttpResponse
from django.utils import timezone
from django.db.models import Avg, Sum, Count
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import FocusSession, SessionEvent, SelfReport
from .serializers import (
    RegisterSerializer,
    UserSerializer,
    FocusSessionListSerializer,
    FocusSessionDetailSerializer,
    FocusSessionCreateSerializer,
    FocusSessionUpdateSerializer,
    BulkEventSerializer,
    SessionEventSerializer,
    SelfReportSerializer,
)


# ──── Auth ────

class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


class UserView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    def post(self, request):
        old_password = request.data.get('old_password', '')
        new_password = request.data.get('new_password', '')
        if not request.user.check_password(old_password):
            return Response({'detail': 'Current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(new_password) < 8:
            return Response({'detail': 'New password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)
        request.user.set_password(new_password)
        request.user.save()
        return Response({'detail': 'Password changed.'})


class DeleteAccountView(APIView):
    def delete(self, request):
        request.user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ──── Sessions ────

class SessionListCreateView(APIView):
    def get(self, request):
        qs = FocusSession.objects.filter(user=request.user)
        date_from = request.query_params.get('from')
        date_to = request.query_params.get('to')
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
    def _get_session(self, request, pk):
        return FocusSession.objects.get(pk=pk, user=request.user)

    def get(self, request, pk):
        try:
            session = self._get_session(request, pk)
        except FocusSession.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(FocusSessionDetailSerializer(session).data)

    def patch(self, request, pk):
        try:
            session = self._get_session(request, pk)
        except FocusSession.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        serializer = FocusSessionUpdateSerializer(session, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(FocusSessionDetailSerializer(session).data)


class SessionEventsView(APIView):
    def post(self, request, pk):
        try:
            session = FocusSession.objects.get(pk=pk, user=request.user)
        except FocusSession.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        serializer = BulkEventSerializer(data=request.data, context={'session': session})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'count': len(serializer.validated_data['events'])}, status=status.HTTP_201_CREATED)


# ──── Analytics ────

class WeeklyAnalyticsView(APIView):
    def get(self, request):
        date_str = request.query_params.get('date')
        if date_str:
            from datetime import date as dt_date
            ref = dt_date.fromisoformat(date_str)
        else:
            ref = timezone.now().date()

        start_of_week = ref - timedelta(days=ref.weekday())  # Monday
        end_of_week = start_of_week + timedelta(days=6)

        sessions = FocusSession.objects.filter(
            user=request.user,
            start_time__date__gte=start_of_week,
            start_time__date__lte=end_of_week,
            end_time__isnull=False,
        )

        totals = sessions.aggregate(
            total_sessions=Count('id'),
            avg_score=Avg('focus_score_final'),
            total_duration=Sum('duration'),
            total_idle=Sum('time_idle'),
            total_tab_hidden=Sum('time_tab_hidden'),
            total_face_missing=Sum('time_face_missing'),
            total_looking_away=Sum('time_looking_away'),
        )

        daily = []
        for i in range(7):
            day = start_of_week + timedelta(days=i)
            day_sessions = sessions.filter(start_time__date=day)
            agg = day_sessions.aggregate(
                count=Count('id'),
                avg_score=Avg('focus_score_final'),
                total_duration=Sum('duration'),
            )
            daily.append({
                'date': day.isoformat(),
                'sessions': agg['count'],
                'avg_score': agg['avg_score'],
                'total_duration': agg['total_duration'] or 0,
            })

        # Per-day-per-hour heatmap data
        heatmap = []
        for i in range(7):
            day = start_of_week + timedelta(days=i)
            day_events = SessionEvent.objects.filter(
                session__user=request.user,
                session__start_time__date=day,
            )
            for hour in range(24):
                hour_events = day_events.filter(timestamp__hour=hour)
                avg = hour_events.aggregate(avg=Avg('focus_score'))['avg']
                if avg is not None:
                    heatmap.append({
                        'day': i,
                        'hour': hour,
                        'score': round(avg, 1),
                    })

        return Response({
            'week_start': start_of_week.isoformat(),
            'week_end': end_of_week.isoformat(),
            'total_sessions': totals['total_sessions'],
            'avg_score': round(totals['avg_score'], 1) if totals['avg_score'] else None,
            'total_duration': totals['total_duration'] or 0,
            'distractions': {
                'idle': totals['total_idle'] or 0,
                'tab_hidden': totals['total_tab_hidden'] or 0,
                'face_missing': totals['total_face_missing'] or 0,
                'looking_away': totals['total_looking_away'] or 0,
            },
            'daily': daily,
            'heatmap': heatmap,
        })


# ──── Self-Reports (Ground Truth) ────

class SessionReportsView(APIView):
    def post(self, request, pk):
        try:
            session = FocusSession.objects.get(pk=pk, user=request.user)
        except FocusSession.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        serializer = SelfReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(session=session)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def get(self, request, pk):
        try:
            session = FocusSession.objects.get(pk=pk, user=request.user)
        except FocusSession.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        reports = SelfReport.objects.filter(session=session)
        return Response(SelfReportSerializer(reports, many=True).data)


# ──── ML Data Export ────

class MLExportView(APIView):
    """Export all session events with ML features as CSV for model training."""

    def get(self, request):
        qs = SessionEvent.objects.filter(session__user=request.user)

        date_from = request.query_params.get('from')
        date_to = request.query_params.get('to')
        if date_from:
            qs = qs.filter(timestamp__date__gte=date_from)
        if date_to:
            qs = qs.filter(timestamp__date__lte=date_to)

        fmt = request.query_params.get('format', 'csv')

        if fmt == 'json':
            serializer = SessionEventSerializer(qs, many=True)
            return Response(serializer.data)

        # Default: CSV download
        output = io.StringIO()
        fields = [f.name for f in SessionEvent._meta.get_fields() if f.name != 'id']
        writer = csv.writer(output)
        writer.writerow(fields)

        for event in qs.iterator():
            row = []
            for field in fields:
                val = getattr(event, field, None)
                if hasattr(val, 'id'):  # ForeignKey → just write the id
                    val = val.id
                row.append(val)
            writer.writerow(row)

        response = HttpResponse(output.getvalue(), content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="deepfocus_ml_export.csv"'
        return response
