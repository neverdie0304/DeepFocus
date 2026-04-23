"""
Tests for authentication endpoints: register, login, user, change-password,
delete-account, and JWT token refresh.
"""
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()


class RegisterTests(APITestCase):
    url = "/api/auth/register/"

    def test_register_success(self):
        response = self.client.post(self.url, {
            "username": "newuser",
            "email": "new@example.com",
            "password": "secure_pass_123",
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username="newuser").exists())

    def test_register_password_write_only(self):
        response = self.client.post(self.url, {
            "username": "newuser2",
            "email": "new2@example.com",
            "password": "secure_pass_123",
        })
        self.assertNotIn("password", response.data)

    def test_register_password_too_short(self):
        response = self.client.post(self.url, {
            "username": "newuser3",
            "password": "short",
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_requires_username(self):
        response = self.client.post(self.url, {"password": "secure_pass_123"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_duplicate_username(self):
        User.objects.create_user(username="existing", password="pass12345")
        response = self.client.post(self.url, {
            "username": "existing",
            "password": "another_pass_123",
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class LoginTests(APITestCase):
    url = "/api/auth/login/"

    def setUp(self):
        self.user = User.objects.create_user(
            username="loginuser", password="correct_pass"
        )

    def test_login_success_returns_tokens(self):
        response = self.client.post(self.url, {
            "username": "loginuser",
            "password": "correct_pass",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_login_wrong_password(self):
        response = self.client.post(self.url, {
            "username": "loginuser",
            "password": "wrong_pass",
        })
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_unknown_user(self):
        response = self.client.post(self.url, {
            "username": "doesnotexist",
            "password": "any",
        })
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class UserEndpointTests(APITestCase):
    url = "/api/auth/user/"

    def setUp(self):
        self.user = User.objects.create_user(
            username="frank", email="frank@example.com", password="pass12345"
        )

    def test_get_current_user_authenticated(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "frank")
        self.assertEqual(response.data["email"], "frank@example.com")

    def test_get_current_user_unauthenticated(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class ChangePasswordTests(APITestCase):
    url = "/api/auth/change-password/"

    def setUp(self):
        self.user = User.objects.create_user(
            username="grace", password="old_password_123"
        )
        self.client.force_authenticate(self.user)

    def test_change_password_success(self):
        response = self.client.post(self.url, {
            "old_password": "old_password_123",
            "new_password": "new_password_456",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("new_password_456"))

    def test_change_password_wrong_old(self):
        response = self.client.post(self.url, {
            "old_password": "wrong_old",
            "new_password": "new_password_456",
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_change_password_too_short(self):
        response = self.client.post(self.url, {
            "old_password": "old_password_123",
            "new_password": "short",
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_change_password_requires_auth(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(self.url, {
            "old_password": "x", "new_password": "y",
        })
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class DeleteAccountTests(APITestCase):
    url = "/api/auth/delete-account/"

    def setUp(self):
        self.user = User.objects.create_user(
            username="henry", password="pass12345"
        )

    def test_delete_account_success(self):
        self.client.force_authenticate(self.user)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(username="henry").exists())

    def test_delete_account_requires_auth(self):
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class TokenRefreshTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="irene", password="pass12345")
        login_response = self.client.post("/api/auth/login/", {
            "username": "irene", "password": "pass12345",
        })
        self.refresh_token = login_response.data["refresh"]

    def test_refresh_returns_new_access_token(self):
        response = self.client.post("/api/auth/refresh/", {
            "refresh": self.refresh_token,
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

    def test_refresh_with_invalid_token(self):
        response = self.client.post("/api/auth/refresh/", {
            "refresh": "invalid.token.value",
        })
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
