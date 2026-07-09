from io import StringIO

from django.core.management import call_command
from django.contrib.auth.models import AnonymousUser, Group, User
from django.test import RequestFactory, TestCase

from apps.core.permissions import (
    CustomersPermission,
    InventoryPermission,
    SalesPermission,
    ROLE_ADMIN,
    ROLE_CUSTOMERS,
    ROLE_INVENTORY,
    ROLE_READ_ONLY,
    ROLE_SALES,
)


class RolePermissionTest(TestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def _request(self, user, method="get"):
        request_method = getattr(
            self.factory,
            method,
        )
        request = request_method("/test/")
        request.user = user
        return request

    def _user_with_group(self, group_name):
        user = User.objects.create_user(
            username=f"user_{group_name.lower()}",
            password="12345678",
        )
        group, _ = Group.objects.get_or_create(
            name=group_name,
        )
        user.groups.add(group)
        return user

    def test_anonymous_user_is_denied(self):
        request = self._request(
            AnonymousUser(),
        )

        permission = InventoryPermission()

        self.assertFalse(
            permission.has_permission(
                request,
                view=None,
            )
        )

    def test_superuser_is_allowed(self):
        user = User.objects.create_superuser(
            username="admin",
            password="12345678",
        )
        request = self._request(
            user,
            method="post",
        )

        permission = InventoryPermission()

        self.assertTrue(
            permission.has_permission(
                request,
                view=None,
            )
        )

    def test_staff_user_is_allowed(self):
        user = User.objects.create_user(
            username="staff",
            password="12345678",
            is_staff=True,
        )
        request = self._request(
            user,
            method="post",
        )

        permission = SalesPermission()

        self.assertTrue(
            permission.has_permission(
                request,
                view=None,
            )
        )

    def test_admin_group_is_allowed(self):
        user = self._user_with_group(
            ROLE_ADMIN,
        )
        request = self._request(
            user,
            method="post",
        )

        permission = CustomersPermission()

        self.assertTrue(
            permission.has_permission(
                request,
                view=None,
            )
        )

    def test_inventory_group_can_use_inventory_permission(self):
        user = self._user_with_group(
            ROLE_INVENTORY,
        )
        request = self._request(
            user,
            method="post",
        )

        permission = InventoryPermission()

        self.assertTrue(
            permission.has_permission(
                request,
                view=None,
            )
        )

    def test_inventory_group_cannot_use_sales_permission(self):
        user = self._user_with_group(
            ROLE_INVENTORY,
        )
        request = self._request(
            user,
            method="post",
        )

        permission = SalesPermission()

        self.assertFalse(
            permission.has_permission(
                request,
                view=None,
            )
        )

    def test_sales_group_can_use_sales_permission(self):
        user = self._user_with_group(
            ROLE_SALES,
        )
        request = self._request(
            user,
            method="post",
        )

        permission = SalesPermission()

        self.assertTrue(
            permission.has_permission(
                request,
                view=None,
            )
        )

    def test_customers_group_can_use_customers_permission(self):
        user = self._user_with_group(
            ROLE_CUSTOMERS,
        )
        request = self._request(
            user,
            method="post",
        )

        permission = CustomersPermission()

        self.assertTrue(
            permission.has_permission(
                request,
                view=None,
            )
        )

    def test_read_only_group_can_use_safe_methods(self):
        user = self._user_with_group(
            ROLE_READ_ONLY,
        )
        request = self._request(
            user,
            method="get",
        )

        permission = InventoryPermission()

        self.assertTrue(
            permission.has_permission(
                request,
                view=None,
            )
        )

    def test_read_only_group_cannot_use_write_methods(self):
        user = self._user_with_group(
            ROLE_READ_ONLY,
        )
        request = self._request(
            user,
            method="post",
        )

        permission = InventoryPermission()

        self.assertFalse(
            permission.has_permission(
                request,
                view=None,
            )
        )

    def test_authenticated_user_without_group_is_denied(self):
        user = User.objects.create_user(
            username="plain",
            password="12345678",
        )
        request = self._request(
            user,
            method="post",
        )

        permission = InventoryPermission()

        self.assertFalse(
            permission.has_permission(
                request,
                view=None,
            )
        )

class SetupRolesCommandTest(TestCase):
    def test_setup_roles_creates_base_groups(self):
        output = StringIO()

        call_command(
            "setup_roles",
            stdout=output,
        )

        expected_roles = {
            ROLE_ADMIN,
            ROLE_INVENTORY,
            ROLE_SALES,
            ROLE_CUSTOMERS,
            ROLE_READ_ONLY,
        }

        existing_roles = set(
            Group.objects.filter(
                name__in=expected_roles,
            ).values_list(
                "name",
                flat=True,
            )
        )

        self.assertEqual(existing_roles, expected_roles)
        self.assertIn("Roles ready.", output.getvalue())

    def test_setup_roles_is_idempotent(self):
        call_command("setup_roles")
        call_command("setup_roles")

        self.assertEqual(
            Group.objects.filter(
                name__in=[
                    ROLE_ADMIN,
                    ROLE_INVENTORY,
                    ROLE_SALES,
                    ROLE_CUSTOMERS,
                    ROLE_READ_ONLY,
                ]
            ).count(),
            5,
        )