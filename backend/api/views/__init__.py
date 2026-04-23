"""
api.views package.

View classes are grouped by responsibility:

- ``auth``:       registration, current-user info, password change, account deletion
- ``sessions``:   focus session CRUD and bulk event upload
- ``reports``:    self-report (ESM and post-session) submission and retrieval
- ``analytics``:  weekly aggregate analytics for the dashboard
- ``ml``:         bulk data export for offline model training

The URL configuration imports view classes from this package, so downstream
consumers can continue to reference ``api.views.ViewName`` without caring
about the underlying module.
"""
from .auth import (
    RegisterView,
    UserView,
    ChangePasswordView,
    DeleteAccountView,
)
from .sessions import (
    SessionListCreateView,
    SessionDetailView,
    SessionEventsView,
)
from .reports import SessionReportsView
from .analytics import WeeklyAnalyticsView
from .ml import MLExportView

__all__ = [
    "RegisterView",
    "UserView",
    "ChangePasswordView",
    "DeleteAccountView",
    "SessionListCreateView",
    "SessionDetailView",
    "SessionEventsView",
    "SessionReportsView",
    "WeeklyAnalyticsView",
    "MLExportView",
]
