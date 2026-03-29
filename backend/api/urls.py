from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import views

urlpatterns = [
    # Auth
    path('auth/register/', views.RegisterView.as_view()),
    path('auth/login/', TokenObtainPairView.as_view()),
    path('auth/refresh/', TokenRefreshView.as_view()),
    path('auth/user/', views.UserView.as_view()),
    path('auth/change-password/', views.ChangePasswordView.as_view()),
    path('auth/delete-account/', views.DeleteAccountView.as_view()),

    # Sessions
    path('sessions/', views.SessionListCreateView.as_view()),
    path('sessions/<int:pk>/', views.SessionDetailView.as_view()),
    path('sessions/<int:pk>/events/', views.SessionEventsView.as_view()),
    path('sessions/<int:pk>/reports/', views.SessionReportsView.as_view()),

    # Analytics
    path('analytics/weekly/', views.WeeklyAnalyticsView.as_view()),

    # ML
    path('ml/export/', views.MLExportView.as_view()),
]
