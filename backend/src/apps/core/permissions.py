from rest_framework import permissions


ROLE_ADMIN = "ADMIN"
ROLE_INVENTORY = "INVENTORY"
ROLE_SALES = "SALES"
ROLE_CUSTOMERS = "CUSTOMERS"
ROLE_READ_ONLY = "READ_ONLY"


class BaseRolePermission(permissions.BasePermission):
    required_roles = set()

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated:
            return False

        if user.is_superuser or user.is_staff:
            return True

        user_roles = set(
            user.groups.values_list(
                "name",
                flat=True,
            )
        )

        if ROLE_ADMIN in user_roles:
            return True

        if (
            request.method in permissions.SAFE_METHODS
            and ROLE_READ_ONLY in user_roles
        ):
            return True

        return bool(
            self.required_roles.intersection(user_roles)
        )


class InventoryPermission(BaseRolePermission):
    required_roles = {
        ROLE_INVENTORY,
    }


class SalesPermission(BaseRolePermission):
    required_roles = {
        ROLE_SALES,
    }


class CustomersPermission(BaseRolePermission):
    required_roles = {
        ROLE_CUSTOMERS,
    }