"""
Authentication-related views.

Login and token-refresh themselves are handled by ``rest_framework_simplejwt``
and wired up in ``api/urls.py``. This module contains the views that sit
around them: account creation, retrieving the current user, password change,
and account deletion.
"""
from __future__ import annotations

from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from api.constants import MIN_PASSWORD_LENGTH
from api.serializers import RegisterSerializer, UserSerializer


class RegisterView(generics.CreateAPIView):
    """Create a new user account. Open to unauthenticated callers."""

    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


class UserView(APIView):
    """Return basic profile information for the authenticated caller."""

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    """Change the authenticated user's password after verifying the current one."""

    def post(self, request):
        old_password = request.data.get("old_password", "")
        new_password = request.data.get("new_password", "")

        if not request.user.check_password(old_password):
            return Response(
                {"detail": "Current password is incorrect."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(new_password) < MIN_PASSWORD_LENGTH:
            return Response(
                {
                    "detail": (
                        f"New password must be at least {MIN_PASSWORD_LENGTH} characters."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        request.user.set_password(new_password)
        request.user.save()
        return Response({"detail": "Password changed."})


class DeleteAccountView(APIView):
    """
    Permanently delete the authenticated user's account.

    Cascading foreign keys on FocusSession, SessionEvent, and SelfReport ensure
    all associated data is removed in the same transaction.
    """

    def delete(self, request):
        request.user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
