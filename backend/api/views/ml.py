"""
Machine-learning data export view.

Exports the caller's SessionEvent rows (with all ML feature fields) in either
CSV or JSON format, for offline training or evaluation. Optional ``from`` and
``to`` query parameters restrict the date range. Never exposes other users'
data.
"""
from __future__ import annotations

import csv
import io

from django.db.models import ForeignKey
from django.http import HttpResponse
from rest_framework.response import Response
from rest_framework.views import APIView

from api.models import SessionEvent
from api.serializers import SessionEventSerializer

EXPORT_FILENAME = "deepfocus_ml_export.csv"


class MLExportView(APIView):
    """Stream a CSV (default) or JSON dump of SessionEvents owned by the caller."""

    def get(self, request):
        qs = self._filtered_queryset(request)
        fmt = request.query_params.get("format", "csv")

        if fmt == "json":
            serializer = SessionEventSerializer(qs, many=True)
            return Response(serializer.data)

        return self._csv_response(qs)

    @staticmethod
    def _filtered_queryset(request):
        """Return the caller's SessionEvents, optionally date-filtered."""
        qs = SessionEvent.objects.filter(session__user=request.user)
        date_from = request.query_params.get("from")
        date_to = request.query_params.get("to")
        if date_from:
            qs = qs.filter(timestamp__date__gte=date_from)
        if date_to:
            qs = qs.filter(timestamp__date__lte=date_to)
        return qs

    @staticmethod
    def _csv_response(qs):
        """Serialise the queryset as CSV and return a downloadable response."""
        output = io.StringIO()

        # Export all concrete fields, excluding the primary key.
        fields = [
            f.name
            for f in SessionEvent._meta.get_fields()
            if f.name != "id" and not f.is_relation or isinstance(f, ForeignKey)
        ]

        writer = csv.writer(output)
        writer.writerow(fields)

        for event in qs.iterator():
            row = []
            for field_name in fields:
                val = getattr(event, field_name, None)
                # ForeignKey attribute returns the related object; write the PK.
                if hasattr(val, "id"):
                    val = val.id
                row.append(val)
            writer.writerow(row)

        response = HttpResponse(output.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{EXPORT_FILENAME}"'
        return response
