from django.contrib.auth.models import Group, Permission
from django.core.management.base import BaseCommand

from apps.core.permissions import (
    ROLE_ADMIN,
    ROLE_CUSTOMERS,
    ROLE_INVENTORY,
    ROLE_READ_ONLY,
    ROLE_SALES,
)

# Codenames de ModulePermissions (apps/core/models.py) que le
# corresponden a cada rol preset, aparte de ADMIN (que recibe todos
# los permisos de módulo existentes, ver handle()).
ROLE_PERMISSIONS = {
    ROLE_INVENTORY: [
        "view_products",
        "add_products",
        "change_products",
        "view_locations",
        "add_locations",
        "change_locations",
        "view_suppliers",
        "add_suppliers",
        "change_suppliers",
        "view_purchases",
        "add_purchases",
        "change_purchases",
        "cancel_purchases",
        "view_inventory_counts",
        "add_inventory_counts",
        "change_inventory_counts",
        "cancel_inventory_counts",
        "view_movements",
        "view_documents",
        "view_reports",
    ],
    ROLE_SALES: [
        "view_sales",
        "add_sales",
        "change_sales",
        "cancel_sales",
        "view_reports",
    ],
    ROLE_CUSTOMERS: [
        "view_customers",
        "add_customers",
        "change_customers",
        "view_injectors",
        "add_injectors",
        "change_injectors",
        "view_services",
        "add_services",
        "change_services",
        "cancel_services",
    ],
    ROLE_READ_ONLY: [
        "view_products",
        "view_locations",
        "view_suppliers",
        "view_purchases",
        "view_inventory_counts",
        "view_sales",
        "view_customers",
        "view_injectors",
        "view_services",
        "view_reports",
        "view_documents",
        "view_movements",
    ],
}


class Command(BaseCommand):
    help = "Create base application roles and assign their module permissions."

    def handle(self, *args, **options):
        roles = [
            ROLE_ADMIN,
            ROLE_INVENTORY,
            ROLE_SALES,
            ROLE_CUSTOMERS,
            ROLE_READ_ONLY,
        ]

        module_permissions = Permission.objects.filter(
            content_type__app_label="core",
            content_type__model="modulepermissions",
        )

        created_count = 0

        for role in roles:
            group, created = Group.objects.get_or_create(
                name=role,
            )

            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Created role: {role}"
                    )
                )
            else:
                self.stdout.write(
                    f"Role already exists: {role}"
                )

            if role == ROLE_ADMIN:
                # ADMIN ya tiene bypass a nivel de código (ver
                # ModulePermission en apps/core/permissions.py).
                # Además se le asignan todos los permisos de módulo
                # existentes para que la base de datos quede
                # consistente con lo que el rol representa.
                group.permissions.set(module_permissions)
            else:
                codenames = ROLE_PERMISSIONS.get(role, [])
                group.permissions.set(
                    module_permissions.filter(
                        codename__in=codenames,
                    )
                )

            self.stdout.write(
                f"  Permisos de módulo asignados: "
                f"{group.permissions.count()}"
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Roles ready. Created: {created_count}. Total: {len(roles)}."
            )
        )
