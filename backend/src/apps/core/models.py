from django.conf import settings
from django.db import models


class TimeStampedModel(models.Model):
    """
    Modelo abstracto que agrega fechas de creación y modificación.
    """

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class ActivableModel(models.Model):
    """
    Modelo abstracto para entidades que pueden activarse o desactivarse.
    """

    is_active = models.BooleanField(default=True)

    class Meta:
        abstract = True


class AuditModel(TimeStampedModel):
    """
    Modelo abstracto que registra quién creó y modificó un registro.
    """

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="%(class)s_created",
    )

    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="%(class)s_updated",
    )

    class Meta:
        abstract = True


class ModulePermissions(models.Model):
    """
    Modelo fantasma (sin tabla en la base de datos) que existe
    únicamente para declarar los permisos de cada módulo funcional
    del sistema.

    Los módulos de negocio no siempre coinciden 1:1 con un modelo de
    Django (ej. "Compras" agrupa Purchase, PurchaseItem, ImportCost
    e ImportCostCategory), así que en vez de usar los permisos
    automáticos de cada modelo (add_purchase, add_purchaseitem, ...)
    se declara un permiso explícito por módulo y acción acá.

    Ver apps/core/permissions.py para cómo se consumen estos
    permisos, y apps/core/management/commands/setup_roles.py para
    cómo se le asignan a cada rol preset.
    """

    class Meta:
        managed = False
        default_permissions = ()
        permissions = [
            ("view_products", "Productos: ver"),
            ("add_products", "Productos: crear"),
            ("change_products", "Productos: editar"),
            ("view_locations", "Ubicaciones: ver"),
            ("add_locations", "Ubicaciones: crear"),
            ("change_locations", "Ubicaciones: editar"),
            ("view_suppliers", "Proveedores: ver"),
            ("add_suppliers", "Proveedores: crear"),
            ("change_suppliers", "Proveedores: editar"),
            ("view_purchases", "Compras: ver"),
            ("add_purchases", "Compras: crear"),
            ("change_purchases", "Compras: editar"),
            ("cancel_purchases", "Compras: cancelar"),
            ("view_inventory_counts", "Conteos físicos: ver"),
            ("add_inventory_counts", "Conteos físicos: crear"),
            ("change_inventory_counts", "Conteos físicos: editar"),
            ("cancel_inventory_counts", "Conteos físicos: cancelar"),
            ("view_sales", "Ventas: ver"),
            ("add_sales", "Ventas: crear"),
            ("change_sales", "Ventas: editar"),
            ("cancel_sales", "Ventas: cancelar"),
            ("view_customers", "Clientes: ver"),
            ("add_customers", "Clientes: crear"),
            ("change_customers", "Clientes: editar"),
            ("view_injectors", "Inyectores: ver"),
            ("add_injectors", "Inyectores: crear"),
            ("change_injectors", "Inyectores: editar"),
            ("view_services", "Servicios: ver"),
            ("add_services", "Servicios: crear"),
            ("change_services", "Servicios: editar"),
            ("cancel_services", "Servicios: cancelar"),
            ("view_reports", "Reportes: ver"),
            ("view_documents", "Documentos: ver"),
            ("view_movements", "Movimientos de inventario: ver"),
        ]
