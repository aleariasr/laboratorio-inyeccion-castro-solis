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
#
# view_reports es exclusivo de ADMIN: ningún otro rol lo incluye
# aquí. Ver apps/core/tests.py (InventoryReportsApiTest,
# BusinessReportsApiTest) para la verificación de que INVENTORY,
# SALES y READ_ONLY quedan bloqueados de /api/reports/*.
# view_costs no aparece en ningún rol: es exclusivo de ADMIN, que recibe
# todos los permisos por código en handle(). Controla el histórico de
# costos y el precio sugerido del producto (ver CostsPermission y
# ProductSerializer.get_latest_suggested_price).
#
# view_movements tampoco: la pantalla de Movimientos se entra solo desde
# Reportes, que es de ADMIN (decisión del 2026-10-10, punto 6).
ROLE_PERMISSIONS = {
    # Bodega: qué productos hay y dónde están. Sin compras, proveedores
    # ni conteos, y por lo tanto sin ningún costo (punto 13).
    ROLE_INVENTORY: [
        "view_products",
        "add_products",
        "change_products",
        "view_locations",
        "add_locations",
        "change_locations",
        "view_documents",
        "add_documents",
    ],
    # view_products es lo que le permite buscar productos para armar una
    # venta; sin él, el formulario de línea no funciona (punto 4).
    ROLE_SALES: [
        "view_sales",
        "add_sales",
        "change_sales",
        "cancel_sales",
        "view_products",
        "view_documents",
    ],
    # Igual que SALES: view_products es para agregar accesorios a un
    # servicio (punto 4).
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
        "view_products",
        "view_documents",
    ],
    # Consulta sin modificar nada. Sin view_costs: no ve el costo en las
    # pantallas de producto, aunque sí lo ve dentro de una compra, que es
    # donde el costo es el dato principal del documento.
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
        "view_documents",
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
