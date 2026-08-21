from django.contrib.auth.models import Group, User
from django.core.management import call_command
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from apps.core.permissions import (
    ROLE_ADMIN,
    ROLE_CUSTOMERS,
    ROLE_INVENTORY,
    ROLE_READ_ONLY,
    ROLE_SALES,
)


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


class UserAdministrationPermissionApiTest(APITestCase):
    """
    /api/accounts/users/ y /api/accounts/roles/ usan
    AdministrationPermission (superuser, is_staff o grupo ADMIN), no
    el IsAdminUser nativo de DRF (que solo mira is_staff). La
    diferencia real es que ahora un miembro del grupo ADMIN sin
    is_staff también puede administrar usuarios: is_staff sigue
    dando acceso igual que antes, no se le quitó nada.
    """

    def setUp(self):
        call_command("setup_roles")

        self.superuser = User.objects.create_superuser(
            username="super-admin",
            password="12345678",
        )

        self.staff_user = User.objects.create_user(
            username="staff-admin",
            password="12345678",
            is_staff=True,
        )

        self.role_admin_user = User.objects.create_user(
            username="role-admin",
            password="12345678",
        )
        self.role_admin_user.groups.add(
            Group.objects.get(name=ROLE_ADMIN),
        )

        self.plain_user = User.objects.create_user(
            username="plain-accounts",
            password="12345678",
        )

    def test_superuser_can_list_users(self):
        self.client.force_authenticate(self.superuser)

        response = self.client.get("/api/accounts/users/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_staff_user_can_list_users(self):
        self.client.force_authenticate(self.staff_user)

        response = self.client.get("/api/accounts/users/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_role_admin_group_member_can_list_users(self):
        """
        Con el IsAdminUser anterior, esto daba 403: un miembro del
        grupo ADMIN sin is_staff no podía administrar usuarios, aunque
        conceptualmente sí debería poder.
        """
        self.client.force_authenticate(self.role_admin_user)

        response = self.client.get("/api/accounts/users/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_plain_user_cannot_list_users(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.get("/api/accounts/users/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_user_cannot_list_users(self):
        response = self.client.get("/api/accounts/users/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_cannot_grant_superuser_via_patch(self):
        """
        is_superuser es de solo lectura en el serializer: nadie debe
        poder auto-otorgarse (u otorgarle a otro) el bypass total del
        sistema de permisos mandando is_superuser=true en un PATCH.
        """
        target = User.objects.create_user(
            username="no-superuser-grant",
            password="12345678",
        )

        self.client.force_authenticate(self.superuser)

        response = self.client.patch(
            f"/api/accounts/users/{target.id}/",
            {"is_superuser": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        target.refresh_from_db()

        self.assertFalse(target.is_superuser)


class RoleListApiTest(APITestCase):
    def setUp(self):
        call_command("setup_roles")

        self.admin = User.objects.create_superuser(
            username="roles-admin",
            password="12345678",
        )

        self.plain_user = User.objects.create_user(
            username="roles-plain",
            password="12345678",
        )

    def test_admin_can_list_roles(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get("/api/accounts/roles/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            set(response.data["results"]),
            {
                ROLE_ADMIN,
                ROLE_INVENTORY,
                ROLE_SALES,
                ROLE_CUSTOMERS,
                ROLE_READ_ONLY,
            },
        )

    def test_plain_user_cannot_list_roles(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.get("/api/accounts/roles/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_user_cannot_list_roles(self):
        response = self.client.get("/api/accounts/roles/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class UserRoleAssignmentApiTest(APITestCase):
    def setUp(self):
        call_command("setup_roles")

        self.admin = User.objects.create_superuser(
            username="assign-admin",
            password="12345678",
        )
        self.client.force_authenticate(self.admin)

        self.target_user = User.objects.create_user(
            username="assign-target",
            password="12345678",
        )

    def test_admin_can_assign_role_to_user(self):
        response = self.client.patch(
            f"/api/accounts/users/{self.target_user.id}/",
            {"groups": [ROLE_INVENTORY]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.target_user.refresh_from_db()

        self.assertEqual(
            set(
                self.target_user.groups.values_list("name", flat=True)
            ),
            {ROLE_INVENTORY},
        )

    def test_admin_can_remove_role_from_user(self):
        self.target_user.groups.add(
            Group.objects.get(name=ROLE_INVENTORY),
        )

        response = self.client.patch(
            f"/api/accounts/users/{self.target_user.id}/",
            {"groups": []},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.target_user.refresh_from_db()

        self.assertEqual(self.target_user.groups.count(), 0)

    def test_admin_can_replace_users_roles(self):
        self.target_user.groups.add(
            Group.objects.get(name=ROLE_INVENTORY),
        )

        response = self.client.patch(
            f"/api/accounts/users/{self.target_user.id}/",
            {"groups": [ROLE_SALES]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.target_user.refresh_from_db()

        self.assertEqual(
            set(
                self.target_user.groups.values_list("name", flat=True)
            ),
            {ROLE_SALES},
        )

    def test_assigning_unknown_role_name_returns_400(self):
        response = self.client.patch(
            f"/api/accounts/users/{self.target_user.id}/",
            {"groups": ["NOT_A_REAL_ROLE"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_users_detail_includes_group_names(self):
        self.target_user.groups.add(
            Group.objects.get(name=ROLE_SALES),
        )

        response = self.client.get(
            f"/api/accounts/users/{self.target_user.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["groups"], [ROLE_SALES])


class UserSelfLockoutProtectionApiTest(APITestCase):
    """
    Nadie puede desactivar su propia cuenta ni quitarse su propio rol
    ADMIN vía esta API: son las dos formas obvias en que un
    administrador se dejaría fuera del sistema por accidente.
    """

    def setUp(self):
        call_command("setup_roles")

        self.role_admin_user = User.objects.create_user(
            username="lockout-admin",
            password="12345678",
        )
        self.role_admin_user.groups.add(
            Group.objects.get(name=ROLE_ADMIN),
        )

        self.other_admin = User.objects.create_user(
            username="lockout-other-admin",
            password="12345678",
        )
        self.other_admin.groups.add(
            Group.objects.get(name=ROLE_ADMIN),
        )

        self.client.force_authenticate(self.role_admin_user)

    def test_admin_cannot_deactivate_own_account(self):
        response = self.client.patch(
            f"/api/accounts/users/{self.role_admin_user.id}/",
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("is_active", response.data)

        self.role_admin_user.refresh_from_db()

        self.assertTrue(self.role_admin_user.is_active)

    def test_admin_cannot_remove_own_admin_role(self):
        response = self.client.patch(
            f"/api/accounts/users/{self.role_admin_user.id}/",
            {"groups": []},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("groups", response.data)

        self.role_admin_user.refresh_from_db()

        self.assertTrue(
            self.role_admin_user.groups.filter(
                name=ROLE_ADMIN,
            ).exists()
        )

    def test_admin_can_deactivate_another_admin(self):
        response = self.client.patch(
            f"/api/accounts/users/{self.other_admin.id}/",
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.other_admin.refresh_from_db()

        self.assertFalse(self.other_admin.is_active)

    def test_admin_can_remove_admin_role_from_another_admin(self):
        response = self.client.patch(
            f"/api/accounts/users/{self.other_admin.id}/",
            {"groups": []},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.other_admin.refresh_from_db()

        self.assertFalse(
            self.other_admin.groups.filter(
                name=ROLE_ADMIN,
            ).exists()
        )

    def test_admin_can_edit_own_other_fields(self):
        response = self.client.patch(
            f"/api/accounts/users/{self.role_admin_user.id}/",
            {"first_name": "Actualizado"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.role_admin_user.refresh_from_db()

        self.assertEqual(
            self.role_admin_user.first_name,
            "Actualizado",
        )

    def test_user_without_admin_role_can_edit_own_groups_freely(self):
        """
        La protección anti-bloqueo solo aplica si el usuario YA tiene
        el rol ADMIN. Alguien que llega a este endpoint por ser
        is_staff (sin estar en el grupo ADMIN) puede tocar sus propios
        grupos sin restricción: no hay ningún rol de administrador que
        pueda perder por accidente.
        """
        staff_user = User.objects.create_user(
            username="lockout-staff-only",
            password="12345678",
            is_staff=True,
        )
        self.client.force_authenticate(staff_user)

        response = self.client.patch(
            f"/api/accounts/users/{staff_user.id}/",
            {"groups": [ROLE_INVENTORY]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        staff_user.refresh_from_db()

        self.assertEqual(
            set(staff_user.groups.values_list("name", flat=True)),
            {ROLE_INVENTORY},
        )


class UserListFilteringApiTest(APITestCase):
    """
    /api/accounts/users/ soporta búsqueda (?q=) y filtro por estado
    (?is_active=), igual que CustomerViewSet/InjectorViewSet, para que
    la pantalla de Usuarios del frontend tenga un buscador funcional.
    """

    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="filter-admin",
            password="12345678",
        )
        self.client.force_authenticate(self.admin)

        self.active_match = User.objects.create_user(
            username="carlos-mendez",
            password="12345678",
            first_name="Carlos",
            last_name="Méndez",
            email="carlos@example.com",
            is_active=True,
        )

        self.inactive_other = User.objects.create_user(
            username="other-user",
            password="12345678",
            first_name="Ana",
            last_name="Solano",
            email="ana@example.com",
            is_active=False,
        )

    def test_filter_by_query_matches_username(self):
        response = self.client.get("/api/accounts/users/?q=carlos")

        usernames = [row["username"] for row in response.data["results"]]

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("carlos-mendez", usernames)
        self.assertNotIn("other-user", usernames)

    def test_filter_by_query_matches_last_name(self):
        response = self.client.get("/api/accounts/users/?q=solano")

        usernames = [row["username"] for row in response.data["results"]]

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("other-user", usernames)
        self.assertNotIn("carlos-mendez", usernames)

    def test_filter_by_query_matches_email(self):
        response = self.client.get("/api/accounts/users/?q=ana@example.com")

        usernames = [row["username"] for row in response.data["results"]]

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("other-user", usernames)
        self.assertNotIn("carlos-mendez", usernames)

    def test_filter_by_is_active_true(self):
        response = self.client.get("/api/accounts/users/?is_active=true")

        usernames = [row["username"] for row in response.data["results"]]

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("carlos-mendez", usernames)
        self.assertNotIn("other-user", usernames)

    def test_filter_by_is_active_false(self):
        response = self.client.get("/api/accounts/users/?is_active=false")

        usernames = [row["username"] for row in response.data["results"]]

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("other-user", usernames)
        self.assertNotIn("carlos-mendez", usernames)

    def test_invalid_is_active_returns_400(self):
        response = self.client.get("/api/accounts/users/?is_active=maybe")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_is_ordered_by_username(self):
        response = self.client.get("/api/accounts/users/")

        usernames = [row["username"] for row in response.data["results"]]

        self.assertEqual(usernames, sorted(usernames))
