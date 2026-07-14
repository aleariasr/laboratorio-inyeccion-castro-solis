from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase


class AccountsApiTest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin",
            password="12345678",
            email="admin@example.com",
        )

        self.user = User.objects.create_user(
            username="user",
            password="12345678",
            email="user@example.com",
        )

    def test_login_returns_token_and_user(self):
        response = self.client.post(
            "/api/accounts/login/",
            {
                "username": "user",
                "password": "12345678",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("token", response.data)
        self.assertEqual(response.data["user"]["username"], "user")

    def test_login_with_invalid_credentials_returns_401(self):
        response = self.client.post(
            "/api/accounts/login/",
            {
                "username": "user",
                "password": "wrong-password",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_requires_authentication(self):
        response = self.client.get("/api/accounts/me/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_current_user(self):
        self.client.force_authenticate(self.user)

        response = self.client.get("/api/accounts/me/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "user")

    def test_logout_deletes_token(self):
        token = Token.objects.create(user=self.user)
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Token {token.key}",
        )

        response = self.client.post(
            "/api/accounts/logout/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Token.objects.filter(user=self.user).exists())

    def test_admin_can_list_users(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get("/api/accounts/users/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

    def test_regular_user_cannot_list_users(self):
        self.client.force_authenticate(self.user)

        response = self.client.get("/api/accounts/users/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_create_user(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            "/api/accounts/users/",
            {
                "username": "newuser",
                "password": "12345678",
                "first_name": "Nuevo",
                "last_name": "Usuario",
                "email": "newuser@example.com",
                "is_active": True,
                "is_staff": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        user = User.objects.get(username="newuser")

        self.assertTrue(user.check_password("12345678"))
        self.assertEqual(user.first_name, "Nuevo")
        self.assertFalse(user.is_staff)

    def test_admin_can_retrieve_user(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(
            f"/api/accounts/users/{self.user.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "user")

    def test_admin_can_deactivate_user(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            f"/api/accounts/users/{self.user.id}/",
            {
                "is_active": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()

        self.assertFalse(self.user.is_active)

    def test_patch_does_not_change_password(self):
        old_password_hash = self.user.password

        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            f"/api/accounts/users/{self.user.id}/",
            {
                "password": "new-password-123",
                "first_name": "Actualizado",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()

        self.assertEqual(self.user.password, old_password_hash)
        self.assertEqual(self.user.first_name, "Actualizado")