from decimal import Decimal
from io import StringIO
from types import SimpleNamespace

from django.contrib.auth.models import AnonymousUser, Group, Permission, User
from django.core.management import call_command
from django.test import RequestFactory, TestCase

from apps.core.permissions import (
    AdministrationPermission,
    CustomersPermission,
    DocumentsPermission,
    InjectorsPermission,
    InventoryCountsPermission,
    LocationsPermission,
    MovementsPermission,
    ProductsPermission,
    PurchasesPermission,
    ReportsPermission,
    SalesPermission,
    ServicesPermission,
    SuppliersPermission,
    ROLE_ADMIN,
    ROLE_CUSTOMERS,
    ROLE_INVENTORY,
    ROLE_READ_ONLY,
    ROLE_SALES,
)
from apps.core.management.commands.setup_roles import ROLE_PERMISSIONS
from apps.inventory.models import PurchaseItem, PurchaseStatus, SupplierProduct
from apps.inventory.selectors import current_stock
from apps.inventory.services import initial_inventory
from apps.sales.models import Sale, SaleItem, SaleStatus


# Tabla de todas las subclases de ModulePermission que declaran
# add_/change_ (y opcionalmente cancel_), usada por
# ModulePermissionMatrixAllModulesTest para no tener que repetir la
# misma mecánica 12 veces a mano. reports/documents/movements quedan
# fuera de esta tabla porque solo declaran view_<module> (ver
# READ_ONLY_MODULE_SPECS) y no tienen add_/change_/cancel_.
MODULE_PERMISSION_SPECS = [
    ("products", ProductsPermission, False),
    ("locations", LocationsPermission, False),
    ("suppliers", SuppliersPermission, False),
    ("purchases", PurchasesPermission, True),
    ("inventory_counts", InventoryCountsPermission, True),
    ("sales", SalesPermission, True),
    ("customers", CustomersPermission, False),
    ("injectors", InjectorsPermission, False),
    ("services", ServicesPermission, True),
]

# Módulos que en ModulePermissions.Meta.permissions solo declaran
# view_<module>: no existe add_/change_/cancel_ para ellos, así que
# por diseño nadie (fuera de ADMIN/superuser) puede escribir vía la
# API en estos módulos.
READ_ONLY_MODULE_SPECS = [
    ("reports", ReportsPermission),
    ("documents", DocumentsPermission),
    ("movements", MovementsPermission),
]


def _module_permission(codename):
    return Permission.objects.get(
        content_type__app_label="core",
        content_type__model="modulepermissions",
        codename=codename,
    )


class ModulePermissionTest(TestCase):
    """
    Prueba la mecánica genérica de ModulePermission: resolución de
    acción -> codename, bypass de superuser/ADMIN, y que is_staff por
    sí solo ya no da acceso a los módulos de negocio.
    """

    def setUp(self):
        self.factory = RequestFactory()

    def _request(self, user, method="get"):
        request_method = getattr(self.factory, method)
        request = request_method("/test/")
        request.user = user
        return request

    def _view(self, action=None):
        return SimpleNamespace(action=action)

    def test_anonymous_user_is_denied(self):
        request = self._request(AnonymousUser())

        self.assertFalse(
            PurchasesPermission().has_permission(
                request,
                self._view(action="list"),
            )
        )

    def test_superuser_is_allowed_without_any_permission(self):
        user = User.objects.create_superuser(
            username="admin",
            password="12345678",
        )
        request = self._request(user, method="post")

        self.assertTrue(
            PurchasesPermission().has_permission(
                request,
                self._view(action="create"),
            )
        )

    def test_admin_group_is_allowed_without_explicit_permissions(self):
        user = User.objects.create_user(
            username="admin-role",
            password="12345678",
        )
        admin_group, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        user.groups.add(admin_group)

        request = self._request(user, method="post")

        self.assertTrue(
            ServicesPermission().has_permission(
                request,
                self._view(action="cancel"),
            )
        )

    def test_staff_alone_no_longer_bypasses_module_permissions(self):
        """
        A diferencia del esquema anterior basado en roles, is_staff
        por sí solo ya no da acceso a los módulos de negocio: sirve
        para el panel /admin/ de Django, no para el sistema de
        permisos de la aplicación. Solo superuser o el grupo ADMIN
        otorgan bypass.
        """
        user = User.objects.create_user(
            username="staff-only",
            password="12345678",
            is_staff=True,
        )
        request = self._request(user, method="get")

        self.assertFalse(
            ProductsPermission().has_permission(
                request,
                self._view(action="list"),
            )
        )

    def test_user_with_direct_permission_is_allowed(self):
        user = User.objects.create_user(
            username="custom-viewer",
            password="12345678",
        )
        user.user_permissions.add(_module_permission("view_products"))

        request = self._request(user, method="get")

        self.assertTrue(
            ProductsPermission().has_permission(
                request,
                self._view(action="list"),
            )
        )

    def test_user_without_permission_is_denied(self):
        user = User.objects.create_user(
            username="no-perms",
            password="12345678",
        )
        request = self._request(user, method="get")

        self.assertFalse(
            ProductsPermission().has_permission(
                request,
                self._view(action="list"),
            )
        )

    def test_change_permission_does_not_grant_cancel(self):
        user = User.objects.create_user(
            username="purchases-editor",
            password="12345678",
        )
        user.user_permissions.add(_module_permission("change_purchases"))

        request = self._request(user, method="post")
        permission = PurchasesPermission()

        self.assertTrue(
            permission.has_permission(
                request,
                self._view(action="confirm"),
            )
        )
        self.assertFalse(
            permission.has_permission(
                request,
                self._view(action="cancel"),
            )
        )

    def test_cancel_permission_alone_does_not_grant_change(self):
        user = User.objects.create_user(
            username="purchases-canceller",
            password="12345678",
        )
        user.user_permissions.add(_module_permission("cancel_purchases"))

        request = self._request(user, method="post")
        permission = PurchasesPermission()

        self.assertTrue(
            permission.has_permission(
                request,
                self._view(action="cancel"),
            )
        )
        self.assertFalse(
            permission.has_permission(
                request,
                self._view(action="confirm"),
            )
        )

    def test_read_action_only_requires_view_permission(self):
        """
        "labels" es un POST pero de solo lectura (genera un PDF): con
        el permiso de ver productos alcanza, no hace falta el de
        crear.
        """
        user = User.objects.create_user(
            username="labels-viewer",
            password="12345678",
        )
        user.user_permissions.add(_module_permission("view_products"))

        request = self._request(user, method="post")
        permission = ProductsPermission()

        self.assertTrue(
            permission.has_permission(
                request,
                self._view(action="labels"),
            )
        )
        self.assertFalse(
            permission.has_permission(
                request,
                self._view(action="create"),
            )
        )

    def test_role_group_grants_its_module_permissions(self):
        call_command("setup_roles")

        user = User.objects.create_user(
            username="sales-role",
            password="12345678",
        )
        user.groups.add(Group.objects.get(name=ROLE_SALES))

        request = self._request(user, method="post")

        self.assertTrue(
            SalesPermission().has_permission(
                request,
                self._view(action="create"),
            )
        )
        self.assertFalse(
            PurchasesPermission().has_permission(
                request,
                self._view(action="create"),
            )
        )

    def test_administration_permission_denies_anonymous_user(self):
        request = self._request(AnonymousUser())

        self.assertFalse(
            AdministrationPermission().has_permission(
                request,
                view=None,
            )
        )

    def test_administration_permission_allows_admin_group(self):
        user = User.objects.create_user(
            username="administration-admin-role",
            password="12345678",
        )
        admin_group, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        user.groups.add(admin_group)

        request = self._request(user)

        self.assertTrue(
            AdministrationPermission().has_permission(
                request,
                view=None,
            )
        )

    def test_administration_permission_allows_staff_user(self):
        user = User.objects.create_user(
            username="administration-staff",
            password="12345678",
            is_staff=True,
        )
        request = self._request(user)

        self.assertTrue(
            AdministrationPermission().has_permission(
                request,
                view=None,
            )
        )

    def test_administration_permission_allows_superuser(self):
        user = User.objects.create_superuser(
            username="administration-superuser",
            password="12345678",
        )
        request = self._request(user)

        self.assertTrue(
            AdministrationPermission().has_permission(
                request,
                view=None,
            )
        )

    def test_administration_permission_denies_non_admin_role(self):
        user = User.objects.create_user(
            username="administration-inventory-role",
            password="12345678",
        )
        inventory_group, _ = Group.objects.get_or_create(name=ROLE_INVENTORY)
        user.groups.add(inventory_group)

        request = self._request(user)

        self.assertFalse(
            AdministrationPermission().has_permission(
                request,
                view=None,
            )
        )

    def test_administration_permission_denies_read_only_role(self):
        user = User.objects.create_user(
            username="administration-readonly-role",
            password="12345678",
        )
        read_only_group, _ = Group.objects.get_or_create(name=ROLE_READ_ONLY)
        user.groups.add(read_only_group)

        request = self._request(user)

        self.assertFalse(
            AdministrationPermission().has_permission(
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

    def test_setup_roles_grants_exact_permission_set_per_role(self):
        """
        Compara lo que setup_roles realmente deja en la base de datos
        contra ROLE_PERMISSIONS. Si alguien agrega/quita un permiso de
        módulo en ModulePermissions.Meta.permissions o en
        ROLE_PERMISSIONS sin actualizar el otro, este test lo detecta
        (permiso de más o permiso de menos), en vez de descubrirlo en
        producción cuando un rol no puede hacer algo que debería, o
        puede hacer algo que no debería.
        """
        call_command("setup_roles")

        all_module_codenames = set(
            Permission.objects.filter(
                content_type__app_label="core",
                content_type__model="modulepermissions",
            ).values_list(
                "codename",
                flat=True,
            )
        )

        # 34 = cantidad de tuplas en ModulePermissions.Meta.permissions
        # al momento de escribir este test. Un cambio en este número
        # es la señal de que hay que revisar ROLE_PERMISSIONS también.
        self.assertEqual(len(all_module_codenames), 34)

        admin_group = Group.objects.get(name=ROLE_ADMIN)
        admin_codenames = set(
            admin_group.permissions.values_list(
                "codename",
                flat=True,
            )
        )

        # ADMIN no está en ROLE_PERMISSIONS (recibe todo por código en
        # setup_roles), así que se compara aparte contra el catálogo
        # completo.
        self.assertEqual(admin_codenames, all_module_codenames)

        for role, expected_codenames in ROLE_PERMISSIONS.items():
            with self.subTest(role=role):
                group = Group.objects.get(name=role)
                actual_codenames = set(
                    group.permissions.values_list(
                        "codename",
                        flat=True,
                    )
                )

                self.assertEqual(
                    actual_codenames,
                    set(expected_codenames),
                )

    def test_setup_roles_permission_assignment_is_idempotent(self):
        call_command("setup_roles")

        first_run_codenames = {
            role: set(
                Group.objects.get(name=role).permissions.values_list(
                    "codename",
                    flat=True,
                )
            )
            for role in ROLE_PERMISSIONS
        }

        call_command("setup_roles")

        second_run_codenames = {
            role: set(
                Group.objects.get(name=role).permissions.values_list(
                    "codename",
                    flat=True,
                )
            )
            for role in ROLE_PERMISSIONS
        }

        self.assertEqual(first_run_codenames, second_run_codenames)


class ModulePermissionMatrixAllModulesTest(TestCase):
    """
    Repite, para las 12 subclases concretas de ModulePermission, la
    misma mecánica que ModulePermissionTest solo prueba sobre una
    muestra de 3-4 de ellas (view/add/change/cancel). El objetivo es
    que un cambio futuro en un solo módulo (ej. agregar cancel_actions
    a Suppliers, o quitarle read_actions a Products) no pueda romper
    otro módulo sin que quede evidenciado acá.
    """

    def setUp(self):
        self.factory = RequestFactory()

    def _request(self, user, method="get"):
        request_method = getattr(self.factory, method)
        request = request_method("/test/")
        request.user = user
        return request

    def _view(self, action=None):
        return SimpleNamespace(action=action)

    def _user_with_permission(self, codename, username):
        user = User.objects.create_user(
            username=username,
            password="12345678",
        )
        user.user_permissions.add(_module_permission(codename))
        return user

    def test_view_permission_allows_read_and_denies_write_for_every_module(self):
        all_specs = [
            (module, permission_class)
            for module, permission_class, _has_cancel in MODULE_PERMISSION_SPECS
        ] + list(READ_ONLY_MODULE_SPECS)

        for module, permission_class in all_specs:
            with self.subTest(module=module):
                user = self._user_with_permission(
                    f"view_{module}",
                    f"view-only-{module}",
                )
                permission = permission_class()

                read_request = self._request(user, method="get")
                self.assertTrue(
                    permission.has_permission(
                        read_request,
                        self._view(action="list"),
                    )
                )

                create_request = self._request(user, method="post")
                self.assertFalse(
                    permission.has_permission(
                        create_request,
                        self._view(action="create"),
                    )
                )

                update_request = self._request(user, method="patch")
                self.assertFalse(
                    permission.has_permission(
                        update_request,
                        self._view(action="partial_update"),
                    )
                )

    def test_add_permission_allows_create_and_denies_read_and_update(self):
        for module, permission_class, _has_cancel in MODULE_PERMISSION_SPECS:
            with self.subTest(module=module):
                user = self._user_with_permission(
                    f"add_{module}",
                    f"add-only-{module}",
                )
                permission = permission_class()

                create_request = self._request(user, method="post")
                self.assertTrue(
                    permission.has_permission(
                        create_request,
                        self._view(action="create"),
                    )
                )

                read_request = self._request(user, method="get")
                self.assertFalse(
                    permission.has_permission(
                        read_request,
                        self._view(action="list"),
                    )
                )

                update_request = self._request(user, method="patch")
                self.assertFalse(
                    permission.has_permission(
                        update_request,
                        self._view(action="partial_update"),
                    )
                )

    def test_change_permission_allows_update_and_denies_create(self):
        for module, permission_class, _has_cancel in MODULE_PERMISSION_SPECS:
            with self.subTest(module=module):
                user = self._user_with_permission(
                    f"change_{module}",
                    f"change-only-{module}",
                )
                permission = permission_class()

                update_request = self._request(user, method="patch")
                self.assertTrue(
                    permission.has_permission(
                        update_request,
                        self._view(action="partial_update"),
                    )
                )

                create_request = self._request(user, method="post")
                self.assertFalse(
                    permission.has_permission(
                        create_request,
                        self._view(action="create"),
                    )
                )

    def test_change_permission_alone_does_not_grant_cancel(self):
        for module, permission_class, has_cancel in MODULE_PERMISSION_SPECS:
            if not has_cancel:
                continue

            with self.subTest(module=module):
                user = self._user_with_permission(
                    f"change_{module}",
                    f"change-only-cancel-check-{module}",
                )
                permission = permission_class()

                cancel_request = self._request(user, method="post")
                self.assertFalse(
                    permission.has_permission(
                        cancel_request,
                        self._view(action="cancel"),
                    )
                )

    def test_cancel_permission_alone_allows_cancel_and_denies_update(self):
        for module, permission_class, has_cancel in MODULE_PERMISSION_SPECS:
            if not has_cancel:
                continue

            with self.subTest(module=module):
                user = self._user_with_permission(
                    f"cancel_{module}",
                    f"cancel-only-{module}",
                )
                permission = permission_class()

                cancel_request = self._request(user, method="post")
                self.assertTrue(
                    permission.has_permission(
                        cancel_request,
                        self._view(action="cancel"),
                    )
                )

                update_request = self._request(user, method="patch")
                self.assertFalse(
                    permission.has_permission(
                        update_request,
                        self._view(action="partial_update"),
                    )
                )

    def test_read_only_modules_have_no_write_permission_in_database(self):
        """
        reports, documents y movements solo declaran view_<module> en
        ModulePermissions: no existe add_/change_/cancel_ para ellos.
        Si alguna vez se agrega una de esas variantes sin actualizar
        este test, hay que revisar también setup_roles y el frontend,
        porque implicaría que el módulo dejó de ser de solo lectura.
        """
        for module, _permission_class in READ_ONLY_MODULE_SPECS:
            with self.subTest(module=module):
                self.assertFalse(
                    Permission.objects.filter(
                        content_type__app_label="core",
                        content_type__model="modulepermissions",
                        codename=f"add_{module}",
                    ).exists()
                )
                self.assertFalse(
                    Permission.objects.filter(
                        content_type__app_label="core",
                        content_type__model="modulepermissions",
                        codename=f"change_{module}",
                    ).exists()
                )
                self.assertFalse(
                    Permission.objects.filter(
                        content_type__app_label="core",
                        content_type__model="modulepermissions",
                        codename=f"cancel_{module}",
                    ).exists()
                )


from datetime import date

from rest_framework import status
from rest_framework.test import APITestCase

from apps.customers.models import Customer, Injector
from apps.inventory.models import (
    Product,
    ProductReference,
    Purchase,
    StorageLocation,
    Supplier,
)


class UniversalSearchApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="search-user",
            password="12345678",
        )
        self.client.force_authenticate(self.user)

        self.location = StorageLocation.objects.create(
            code="A124",
            description="Estante A posición 124",
            created_by=self.user,
            updated_by=self.user,
        )

        self.product = Product.objects.create(
            standard_code="1-423-124-108",
            name="Tornillo bloqueo Cummins",
            description="Pieza de prueba",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

        self.reference = ProductReference.objects.create(
            product=self.product,
            reference_code="ALT-001",
            manufacturer="Bosch",
            created_by=self.user,
            updated_by=self.user,
        )

        self.supplier = Supplier.objects.create(
            name="Proveedor Central",
            phone="2222-2222",
            email="proveedor@example.com",
            country="Costa Rica",
            created_by=self.user,
            updated_by=self.user,
        )

        self.purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number="FAC-001",
            purchase_date=date.today(),
            currency="CRC",
            created_by=self.user,
            updated_by=self.user,
        )

        self.customer = Customer.objects.create(
            customer_type="PERSON",
            display_name="Cliente Diesel",
            phone="8888-8888",
            email="cliente@example.com",
            identification="1-1111-1111",
            created_by=self.user,
            updated_by=self.user,
        )

        self.injector = Injector.objects.create(
            customer=self.customer,
            injector_number="INY-001",
            description="Inyector Bosch",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_search_requires_authentication(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(
            "/api/search/",
            {
                "q": "A124",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_search_short_query_returns_empty_results(self):
        response = self.client.get(
            "/api/search/",
            {
                "q": "A",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["query"], "A")
        self.assertEqual(response.data["results"]["products"], [])
        self.assertEqual(response.data["results"]["locations"], [])

    def test_search_finds_location(self):
        response = self.client.get(
            "/api/search/",
            {
                "q": "A124",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["results"]["locations"][0]["code"],
            "A124",
        )

    def test_search_finds_product_by_standard_code(self):
        response = self.client.get(
            "/api/search/",
            {
                "q": "1-423",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["results"]["products"][0]["standard_code"],
            "1-423-124-108",
        )

    def test_search_finds_product_reference(self):
        response = self.client.get(
            "/api/search/",
            {
                "q": "ALT-001",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["results"]["product_references"][0][
                "reference_code"
            ],
            "ALT-001",
        )

    def test_search_finds_supplier(self):
        response = self.client.get(
            "/api/search/",
            {
                "q": "Central",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["results"]["suppliers"][0]["name"],
            "PROVEEDOR CENTRAL",
        )

    def test_search_finds_purchase(self):
        response = self.client.get(
            "/api/search/",
            {
                "q": "FAC-001",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["results"]["purchases"][0]["invoice_number"],
            "FAC-001",
        )

    def test_search_finds_customer(self):
        response = self.client.get(
            "/api/search/",
            {
                "q": "Diesel",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["results"]["customers"][0]["display_name"],
            "CLIENTE DIESEL",
        )

    def test_search_finds_injector(self):
        response = self.client.get(
            "/api/search/",
            {
                "q": "INY-001",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["results"]["injectors"][0]["injector_number"],
            "INY-001",
        )

class InventoryReportsApiTest(APITestCase):
    def setUp(self):
        call_command("setup_roles")

        self.inventory_user = User.objects.create_user(
            username="reports-inventory",
            password="12345678",
        )
        self.inventory_user.groups.add(
            Group.objects.get(name=ROLE_INVENTORY),
        )

        self.read_only_user = User.objects.create_user(
            username="reports-readonly",
            password="12345678",
        )
        self.read_only_user.groups.add(
            Group.objects.get(name=ROLE_READ_ONLY),
        )

        self.plain_user = User.objects.create_user(
            username="reports-plain",
            password="12345678",
        )

        self.admin_user = User.objects.create_user(
            username="reports-admin",
            password="12345678",
        )
        self.admin_user.groups.add(
            Group.objects.get(name=ROLE_ADMIN),
        )

        self.location = StorageLocation.objects.create(
            code="B200",
            description="Estante B",
            created_by=self.inventory_user,
            updated_by=self.inventory_user,
        )

        self.product = Product.objects.create(
            standard_code="REP-001",
            name="Producto reporte",
            description="Producto para reportes",
            storage_location=self.location,
            minimum_stock=5,
            created_by=self.inventory_user,
            updated_by=self.inventory_user,
        )

        self.product_with_stock = Product.objects.create(
            standard_code="REP-002",
            name="Producto con stock",
            description="Producto con inventario",
            storage_location=self.location,
            minimum_stock=1,
            created_by=self.inventory_user,
            updated_by=self.inventory_user,
        )

        initial_inventory(
            product=self.product_with_stock,
            quantity=10,
            user=self.inventory_user,
        )

    def test_low_stock_report_lists_products_below_minimum(self):
        self.client.force_authenticate(self.admin_user)

        response = self.client.get(
            "/api/reports/low-stock-products/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        standard_codes = {
            item["standard_code"]
            for item in response.data["results"]
        }

        self.assertIn("REP-001", standard_codes)
        self.assertNotIn("REP-002", standard_codes)

    def test_stock_by_location_report_groups_products(self):
        self.client.force_authenticate(self.admin_user)

        response = self.client.get(
            "/api/reports/stock-by-location/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["results"][0]["code"], "B200")

        product_codes = {
            item["standard_code"]
            for item in response.data["results"][0]["products"]
        }

        self.assertIn("REP-001", product_codes)
        self.assertIn("REP-002", product_codes)

    def test_product_movements_report_lists_movements(self):
        self.client.force_authenticate(self.admin_user)

        response = self.client.get(
            "/api/reports/product-movements/",
            {
                "product": self.product_with_stock.id,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["product"]["standard_code"],
            "REP-002",
        )
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(current_stock(self.product_with_stock), 10)

    def test_product_movements_report_requires_product(self):
        self.client.force_authenticate(self.admin_user)

        response = self.client.get(
            "/api/reports/product-movements/"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reports_block_read_only_user(self):
        # Los reportes ahora son exclusivos de ADMIN: READ_ONLY ya no
        # incluye view_reports en ROLE_PERMISSIONS (setup_roles.py).
        self.client.force_authenticate(self.read_only_user)

        response = self.client.get(
            "/api/reports/low-stock-products/"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_reports_block_inventory_only_user(self):
        # INVENTORY perdió view_reports por el mismo motivo.
        self.client.force_authenticate(self.inventory_user)

        response = self.client.get(
            "/api/reports/low-stock-products/"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_reports_allow_admin_user_to_read(self):
        self.client.force_authenticate(self.admin_user)

        response = self.client.get(
            "/api/reports/low-stock-products/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_reports_block_authenticated_user_without_group(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.get(
            "/api/reports/low-stock-products/"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_reports_require_authentication(self):
        response = self.client.get(
            "/api/reports/low-stock-products/"
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_reports_block_sales_only_user(self):
        # SALES perdió view_reports por el mismo motivo.
        sales_user = User.objects.create_user(
            username="reports-sales-only",
            password="12345678",
        )

        sales_user.groups.add(
            Group.objects.get(name=ROLE_SALES),
        )

        self.client.force_authenticate(sales_user)

        response = self.client.get(
            "/api/reports/low-stock-products/"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_low_stock_report_is_paginated(self):
        Product.objects.create(
            standard_code="REP-003",
            name="Segundo producto bajo mínimo",
            description="Otro producto para probar paginación",
            storage_location=self.location,
            minimum_stock=5,
            created_by=self.inventory_user,
            updated_by=self.inventory_user,
        )

        self.client.force_authenticate(self.admin_user)

        first_page = self.client.get(
            "/api/reports/low-stock-products/",
            {"page_size": 1},
        )

        self.assertEqual(first_page.status_code, status.HTTP_200_OK)
        self.assertEqual(first_page.data["count"], 2)
        self.assertEqual(len(first_page.data["results"]), 1)
        self.assertIsNotNone(first_page.data["next"])
        self.assertIsNone(first_page.data["previous"])

        second_page = self.client.get(
            "/api/reports/low-stock-products/",
            {"page_size": 1, "page": 2},
        )

        self.assertEqual(second_page.status_code, status.HTTP_200_OK)
        self.assertEqual(len(second_page.data["results"]), 1)
        self.assertIsNone(second_page.data["next"])
        self.assertIsNotNone(second_page.data["previous"])

    def test_stock_by_location_report_is_paginated(self):
        second_location = StorageLocation.objects.create(
            code="B201",
            description="Estante B2",
            created_by=self.inventory_user,
            updated_by=self.inventory_user,
        )

        Product.objects.create(
            standard_code="REP-004",
            name="Producto en otra ubicación",
            storage_location=second_location,
            created_by=self.inventory_user,
            updated_by=self.inventory_user,
        )

        self.client.force_authenticate(self.admin_user)

        first_page = self.client.get(
            "/api/reports/stock-by-location/",
            {"page_size": 1},
        )

        self.assertEqual(first_page.status_code, status.HTTP_200_OK)
        self.assertEqual(first_page.data["count"], 2)
        self.assertEqual(len(first_page.data["results"]), 1)
        self.assertIsNotNone(first_page.data["next"])
        self.assertIsNone(first_page.data["previous"])

        second_page = self.client.get(
            "/api/reports/stock-by-location/",
            {"page_size": 1, "page": 2},
        )

        self.assertEqual(second_page.status_code, status.HTTP_200_OK)
        self.assertEqual(len(second_page.data["results"]), 1)
        self.assertIsNone(second_page.data["next"])
        self.assertIsNotNone(second_page.data["previous"])

    def test_stock_by_location_report_filters_by_exact_location(self):
        second_location = StorageLocation.objects.create(
            code="B202",
            description="Estante B3",
            created_by=self.inventory_user,
            updated_by=self.inventory_user,
        )

        Product.objects.create(
            standard_code="REP-005",
            name="Producto en tercera ubicación",
            storage_location=second_location,
            created_by=self.inventory_user,
            updated_by=self.inventory_user,
        )

        self.client.force_authenticate(self.admin_user)

        response = self.client.get(
            "/api/reports/stock-by-location/",
            {"location": self.location.id},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["code"], "B200")

    def test_stock_by_location_report_rejects_invalid_location(self):
        self.client.force_authenticate(self.admin_user)

        response = self.client.get(
            "/api/reports/stock-by-location/",
            {"location": "not-a-number"},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_stock_by_location_report_filters_by_product_search(self):
        self.client.force_authenticate(self.admin_user)

        response = self.client.get(
            "/api/reports/stock-by-location/",
            {"q": "REP-002"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

        product_codes = {
            item["standard_code"]
            for item in response.data["results"][0]["products"]
        }

        self.assertEqual(product_codes, {"REP-002"})

class BusinessReportsApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="business-reports",
            password="12345678",
        )

        call_command("setup_roles")

        # Los reportes de negocio ahora son exclusivos de ADMIN: ver
        # test_business_reports_block_sales_only_user y
        # test_business_reports_block_inventory_only_user más abajo
        # para la verificación del bloqueo a roles no administrativos.
        self.user.groups.add(
            Group.objects.get(name=ROLE_ADMIN),
        )

        self.client.force_authenticate(self.user)

        self.location = StorageLocation.objects.create(
            code="C300",
            description="Estante C",
            created_by=self.user,
            updated_by=self.user,
        )

        self.product = Product.objects.create(
            standard_code="TOP-001",
            name="Producto vendido",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

        self.supplier = Supplier.objects.create(
            name="Proveedor Reportes",
            created_by=self.user,
            updated_by=self.user,
        )

        self.supplier_product = SupplierProduct.objects.create(
            supplier=self.supplier,
            product=self.product,
            supplier_reference="SUP-TOP-001",
            created_by=self.user,
            updated_by=self.user,
        )

        self.purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number="REP-FAC-001",
            purchase_date=date(2026, 7, 1),
            currency="CRC",
            status=PurchaseStatus.CONFIRMED,
            created_by=self.user,
            updated_by=self.user,
        )

        PurchaseItem.objects.create(
            purchase=self.purchase,
            supplier_product=self.supplier_product,
            quantity=4,
            unit_cost=Decimal("100.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        self.customer = Customer.objects.create(
            display_name="Cliente Reportes",
            phone="8888-1111",
            created_by=self.user,
            updated_by=self.user,
        )

        self.sale = Sale.objects.create(
            customer=self.customer,
            sale_date=date(2026, 7, 2),
            currency="CRC",
            status=SaleStatus.CONFIRMED,
            created_by=self.user,
            updated_by=self.user,
        )

        SaleItem.objects.create(
            sale=self.sale,
            product=self.product,
            quantity=3,
            unit_price=Decimal("250.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

    def test_purchases_by_supplier_report(self):
        response = self.client.get(
            "/api/reports/purchases-by-supplier/",
            {
                "date_from": "2026-07-01",
                "date_to": "2026-07-31",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

        item = response.data["results"][0]

        self.assertEqual(
            item["supplier"]["name"],
            "PROVEEDOR REPORTES",
        )
        self.assertEqual(item["purchase_count"], 1)
        self.assertEqual(
            Decimal(item["invoice_subtotal"]),
            Decimal("400.0000"),
        )

    def test_sales_by_date_report(self):
        response = self.client.get(
            "/api/reports/sales-by-date/",
            {
                "date_from": "2026-07-01",
                "date_to": "2026-07-31",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

        item = response.data["results"][0]

        self.assertEqual(item["date"], date(2026, 7, 2))
        self.assertEqual(item["sale_count"], 1)
        self.assertEqual(
            Decimal(item["total"]),
            Decimal("750.0000"),
        )

    def test_top_selling_products_report(self):
        response = self.client.get(
            "/api/reports/top-selling-products/",
            {
                "date_from": "2026-07-01",
                "date_to": "2026-07-31",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

        item = response.data["results"][0]

        self.assertEqual(
            item["product"]["standard_code"],
            "TOP-001",
        )
        self.assertEqual(item["quantity_sold"], 3)
        self.assertEqual(
            Decimal(item["total"]),
            Decimal("750.0000"),
        )

    def test_business_reports_reject_invalid_date(self):
        response = self.client.get(
            "/api/reports/sales-by-date/",
            {
                "date_from": "fecha-mala",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_business_reports_reject_inverted_date_range(self):
        response = self.client.get(
            "/api/reports/sales-by-date/",
            {
                "date_from": "2026-07-31",
                "date_to": "2026-07-01",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_purchases_by_supplier_report_converts_mixed_currencies_to_crc(self):
        second_purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number="REP-FAC-002",
            purchase_date=date(2026, 7, 15),
            currency="USD",
            exchange_rate=Decimal("520.0000"),
            status=PurchaseStatus.CONFIRMED,
            created_by=self.user,
            updated_by=self.user,
        )

        PurchaseItem.objects.create(
            purchase=second_purchase,
            supplier_product=self.supplier_product,
            quantity=2,
            unit_cost=Decimal("10.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/reports/purchases-by-supplier/",
            {
                "date_from": "2026-07-01",
                "date_to": "2026-07-31",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

        item = response.data["results"][0]

        # Primera compra (setUp): 4 x 100.0000 CRC = 400.0000 CRC, sin conversión.
        # Segunda compra: 2 x 10.0000 USD = 20.0000 USD, convertidos con su
        # propio tipo de cambio: 20.0000 x 520.0000 = 10400.0000 CRC.
        # Total esperado: 400.0000 + 10400.0000 = 10800.0000 CRC.
        self.assertEqual(item["purchase_count"], 2)
        self.assertEqual(item["currency"], "CRC")
        self.assertEqual(
            Decimal(item["invoice_subtotal"]),
            Decimal("10800.0000"),
        )

    def test_business_reports_block_sales_only_user(self):
        # SALES ya no incluye view_reports en ROLE_PERMISSIONS.
        sales_user = User.objects.create_user(
            username="reports-sales-only",
            password="12345678",
        )

        sales_user.groups.add(
            Group.objects.get(name=ROLE_SALES),
        )

        self.client.force_authenticate(sales_user)

        purchases_response = self.client.get(
            "/api/reports/purchases-by-supplier/"
        )
        sales_response = self.client.get(
            "/api/reports/sales-by-date/"
        )
        top_selling_response = self.client.get(
            "/api/reports/top-selling-products/"
        )

        self.assertEqual(purchases_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(sales_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(top_selling_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_business_reports_block_inventory_only_user(self):
        # INVENTORY tampoco incluye view_reports en ROLE_PERMISSIONS.
        inventory_user = User.objects.create_user(
            username="reports-inventory-only",
            password="12345678",
        )

        inventory_user.groups.add(
            Group.objects.get(name=ROLE_INVENTORY),
        )

        self.client.force_authenticate(inventory_user)

        response = self.client.get(
            "/api/reports/purchases-by-supplier/"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_purchases_by_supplier_report_is_paginated(self):
        second_supplier = Supplier.objects.create(
            name="Proveedor Reportes Dos",
            created_by=self.user,
            updated_by=self.user,
        )

        second_supplier_product = SupplierProduct.objects.create(
            supplier=second_supplier,
            product=self.product,
            supplier_reference="SUP-TOP-002",
            created_by=self.user,
            updated_by=self.user,
        )

        second_purchase = Purchase.objects.create(
            supplier=second_supplier,
            invoice_number="REP-FAC-010",
            purchase_date=date(2026, 7, 10),
            currency="CRC",
            status=PurchaseStatus.CONFIRMED,
            created_by=self.user,
            updated_by=self.user,
        )

        PurchaseItem.objects.create(
            purchase=second_purchase,
            supplier_product=second_supplier_product,
            quantity=1,
            unit_cost=Decimal("50.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        first_page = self.client.get(
            "/api/reports/purchases-by-supplier/",
            {
                "date_from": "2026-07-01",
                "date_to": "2026-07-31",
                "page_size": 1,
            },
        )

        self.assertEqual(first_page.status_code, status.HTTP_200_OK)
        self.assertEqual(first_page.data["count"], 2)
        self.assertEqual(len(first_page.data["results"]), 1)
        self.assertIsNotNone(first_page.data["next"])
        self.assertEqual(first_page.data["date_from"], date(2026, 7, 1))

        second_page = self.client.get(
            "/api/reports/purchases-by-supplier/",
            {
                "date_from": "2026-07-01",
                "date_to": "2026-07-31",
                "page_size": 1,
                "page": 2,
            },
        )

        self.assertEqual(second_page.status_code, status.HTTP_200_OK)
        self.assertEqual(len(second_page.data["results"]), 1)
        self.assertIsNone(second_page.data["next"])

    def test_sales_by_date_report_is_paginated(self):
        second_sale = Sale.objects.create(
            customer=self.customer,
            sale_date=date(2026, 7, 3),
            currency="CRC",
            status=SaleStatus.CONFIRMED,
            created_by=self.user,
            updated_by=self.user,
        )

        SaleItem.objects.create(
            sale=second_sale,
            product=self.product,
            quantity=1,
            unit_price=Decimal("100.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        first_page = self.client.get(
            "/api/reports/sales-by-date/",
            {
                "date_from": "2026-07-01",
                "date_to": "2026-07-31",
                "page_size": 1,
            },
        )

        self.assertEqual(first_page.status_code, status.HTTP_200_OK)
        self.assertEqual(first_page.data["count"], 2)
        self.assertEqual(len(first_page.data["results"]), 1)
        self.assertIsNotNone(first_page.data["next"])

        second_page = self.client.get(
            "/api/reports/sales-by-date/",
            {
                "date_from": "2026-07-01",
                "date_to": "2026-07-31",
                "page_size": 1,
                "page": 2,
            },
        )

        self.assertEqual(second_page.status_code, status.HTTP_200_OK)
        self.assertEqual(len(second_page.data["results"]), 1)
        self.assertIsNone(second_page.data["next"])

    def test_top_selling_products_report_is_paginated(self):
        second_product = Product.objects.create(
            standard_code="TOP-002",
            name="Segundo producto vendido",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

        SaleItem.objects.create(
            sale=self.sale,
            product=second_product,
            quantity=1,
            unit_price=Decimal("100.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        first_page = self.client.get(
            "/api/reports/top-selling-products/",
            {
                "date_from": "2026-07-01",
                "date_to": "2026-07-31",
                "page_size": 1,
            },
        )

        self.assertEqual(first_page.status_code, status.HTTP_200_OK)
        self.assertEqual(first_page.data["count"], 2)
        self.assertEqual(len(first_page.data["results"]), 1)
        self.assertIsNotNone(first_page.data["next"])

        second_page = self.client.get(
            "/api/reports/top-selling-products/",
            {
                "date_from": "2026-07-01",
                "date_to": "2026-07-31",
                "page_size": 1,
                "page": 2,
            },
        )

        self.assertEqual(second_page.status_code, status.HTTP_200_OK)
        self.assertEqual(len(second_page.data["results"]), 1)
        self.assertIsNone(second_page.data["next"])

    def test_top_customers_report_orders_by_total_by_default(self):
        second_customer = Customer.objects.create(
            display_name="Cliente Frecuente",
            phone="8888-2222",
            created_by=self.user,
            updated_by=self.user,
        )

        first_frequent_sale = Sale.objects.create(
            customer=second_customer,
            sale_date=date(2026, 7, 5),
            currency="CRC",
            status=SaleStatus.CONFIRMED,
            created_by=self.user,
            updated_by=self.user,
        )

        SaleItem.objects.create(
            sale=first_frequent_sale,
            product=self.product,
            quantity=1,
            unit_price=Decimal("50.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        second_frequent_sale = Sale.objects.create(
            customer=second_customer,
            sale_date=date(2026, 7, 6),
            currency="CRC",
            status=SaleStatus.CONFIRMED,
            created_by=self.user,
            updated_by=self.user,
        )

        SaleItem.objects.create(
            sale=second_frequent_sale,
            product=self.product,
            quantity=1,
            unit_price=Decimal("50.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        by_total_response = self.client.get(
            "/api/reports/top-customers/",
            {
                "date_from": "2026-07-01",
                "date_to": "2026-07-31",
            },
        )

        self.assertEqual(by_total_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(by_total_response.data["results"]), 2)

        # Por defecto ordena por monto total: Cliente Reportes (750.0000
        # en una sola venta) va antes que Cliente Frecuente (100.0000 en
        # dos ventas).
        first_by_total = by_total_response.data["results"][0]
        self.assertEqual(
            first_by_total["customer"]["display_name"],
            "CLIENTE REPORTES",
        )
        self.assertEqual(first_by_total["sale_count"], 1)
        self.assertEqual(
            Decimal(first_by_total["total"]),
            Decimal("750.0000"),
        )

        by_sale_count_response = self.client.get(
            "/api/reports/top-customers/",
            {
                "date_from": "2026-07-01",
                "date_to": "2026-07-31",
                "ordering": "sale_count",
            },
        )

        self.assertEqual(by_sale_count_response.status_code, status.HTTP_200_OK)

        # Ordenando por cantidad de ventas, Cliente Frecuente (2 ventas)
        # pasa a estar antes que Cliente Reportes (1 venta), aunque su
        # monto total sea menor.
        first_by_sale_count = by_sale_count_response.data["results"][0]
        self.assertEqual(
            first_by_sale_count["customer"]["display_name"],
            "CLIENTE FRECUENTE",
        )
        self.assertEqual(first_by_sale_count["sale_count"], 2)

    def test_top_customers_report_rejects_invalid_ordering(self):
        response = self.client.get(
            "/api/reports/top-customers/",
            {"ordering": "invalid-value"},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_top_customers_report_excludes_sales_without_customer(self):
        anonymous_sale = Sale.objects.create(
            customer=None,
            sale_date=date(2026, 7, 7),
            currency="CRC",
            status=SaleStatus.CONFIRMED,
            created_by=self.user,
            updated_by=self.user,
        )

        SaleItem.objects.create(
            sale=anonymous_sale,
            product=self.product,
            quantity=1,
            unit_price=Decimal("999.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/reports/top-customers/",
            {
                "date_from": "2026-07-01",
                "date_to": "2026-07-31",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(
            response.data["results"][0]["customer"]["display_name"],
            "CLIENTE REPORTES",
        )

    def test_top_customers_report_is_paginated(self):
        second_customer = Customer.objects.create(
            display_name="Cliente Reportes Dos",
            phone="8888-3333",
            created_by=self.user,
            updated_by=self.user,
        )

        second_customer_sale = Sale.objects.create(
            customer=second_customer,
            sale_date=date(2026, 7, 8),
            currency="CRC",
            status=SaleStatus.CONFIRMED,
            created_by=self.user,
            updated_by=self.user,
        )

        SaleItem.objects.create(
            sale=second_customer_sale,
            product=self.product,
            quantity=1,
            unit_price=Decimal("10.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        first_page = self.client.get(
            "/api/reports/top-customers/",
            {
                "date_from": "2026-07-01",
                "date_to": "2026-07-31",
                "page_size": 1,
            },
        )

        self.assertEqual(first_page.status_code, status.HTTP_200_OK)
        self.assertEqual(first_page.data["count"], 2)
        self.assertEqual(len(first_page.data["results"]), 1)
        self.assertIsNotNone(first_page.data["next"])

        second_page = self.client.get(
            "/api/reports/top-customers/",
            {
                "date_from": "2026-07-01",
                "date_to": "2026-07-31",
                "page_size": 1,
                "page": 2,
            },
        )

        self.assertEqual(second_page.status_code, status.HTTP_200_OK)
        self.assertEqual(len(second_page.data["results"]), 1)
        self.assertIsNone(second_page.data["next"])

    def test_product_supplier_prices_report_compares_suppliers_and_converts_currency(self):
        second_purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number="REP-FAC-003",
            purchase_date=date(2026, 7, 20),
            currency="CRC",
            status=PurchaseStatus.CONFIRMED,
            created_by=self.user,
            updated_by=self.user,
        )

        PurchaseItem.objects.create(
            purchase=second_purchase,
            supplier_product=self.supplier_product,
            quantity=2,
            unit_cost=Decimal("120.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        cheap_supplier = Supplier.objects.create(
            name="Proveedor Barato",
            created_by=self.user,
            updated_by=self.user,
        )

        cheap_supplier_product = SupplierProduct.objects.create(
            supplier=cheap_supplier,
            product=self.product,
            supplier_reference="SUP-TOP-BARATO",
            created_by=self.user,
            updated_by=self.user,
        )

        cheap_purchase = Purchase.objects.create(
            supplier=cheap_supplier,
            invoice_number="REP-FAC-004",
            purchase_date=date(2026, 7, 15),
            currency="USD",
            exchange_rate=Decimal("600.0000"),
            status=PurchaseStatus.CONFIRMED,
            created_by=self.user,
            updated_by=self.user,
        )

        PurchaseItem.objects.create(
            purchase=cheap_purchase,
            supplier_product=cheap_supplier_product,
            quantity=5,
            unit_cost=Decimal("0.1500"),
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/reports/product-supplier-prices/",
            {
                "product": self.product.id,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["product"]["standard_code"],
            "TOP-001",
        )
        self.assertEqual(len(response.data["results"]), 2)

        # Ordenado por precio unitario más reciente ascendente: el
        # proveedor más barato primero, aunque su compra en dólares
        # requiera conversión.
        cheapest = response.data["results"][0]
        self.assertEqual(cheapest["supplier"]["name"], "PROVEEDOR BARATO")
        self.assertEqual(cheapest["purchase_count"], 1)
        self.assertEqual(cheapest["currency"], "CRC")
        self.assertEqual(
            Decimal(cheapest["last_unit_cost"]),
            Decimal("90.0000"),
        )
        self.assertEqual(
            Decimal(cheapest["average_unit_cost"]),
            Decimal("90.0000"),
        )
        self.assertEqual(len(cheapest["purchases"]), 1)
        self.assertEqual(
            cheapest["purchases"][0]["invoice_number"],
            "REP-FAC-004",
        )
        self.assertEqual(
            Decimal(cheapest["purchases"][0]["unit_cost"]),
            Decimal("90.0000"),
        )

        # Proveedor original: dos compras en colones, sin conversión.
        # Último precio: 120.0000 (2026-07-20). Promedio: (100+120)/2=110.0000.
        other = response.data["results"][1]
        self.assertEqual(other["supplier"]["name"], "PROVEEDOR REPORTES")
        self.assertEqual(other["purchase_count"], 2)
        self.assertEqual(
            other["last_purchase_date"],
            date(2026, 7, 20),
        )
        self.assertEqual(
            Decimal(other["last_unit_cost"]),
            Decimal("120.0000"),
        )
        self.assertEqual(
            Decimal(other["average_unit_cost"]),
            Decimal("110.0000"),
        )

        # Historial de compras a este proveedor en orden cronológico,
        # para poder ver si el precio cambió con el tiempo.
        self.assertEqual(len(other["purchases"]), 2)

        first_purchase_entry = other["purchases"][0]
        self.assertEqual(first_purchase_entry["invoice_number"], "REP-FAC-001")
        self.assertEqual(first_purchase_entry["purchase_date"], date(2026, 7, 1))
        self.assertEqual(
            Decimal(first_purchase_entry["unit_cost"]),
            Decimal("100.0000"),
        )

        second_purchase_entry = other["purchases"][1]
        self.assertEqual(second_purchase_entry["invoice_number"], "REP-FAC-003")
        self.assertEqual(second_purchase_entry["purchase_date"], date(2026, 7, 20))
        self.assertEqual(
            Decimal(second_purchase_entry["unit_cost"]),
            Decimal("120.0000"),
        )

    def test_product_supplier_prices_report_requires_product(self):
        response = self.client.get(
            "/api/reports/product-supplier-prices/"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_product_supplier_prices_report_rejects_unknown_product(self):
        response = self.client.get(
            "/api/reports/product-supplier-prices/",
            {
                "product": 999999,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_product_supplier_prices_report_is_paginated(self):
        second_supplier = Supplier.objects.create(
            name="Proveedor Reportes Dos",
            created_by=self.user,
            updated_by=self.user,
        )

        second_supplier_product = SupplierProduct.objects.create(
            supplier=second_supplier,
            product=self.product,
            supplier_reference="SUP-TOP-003",
            created_by=self.user,
            updated_by=self.user,
        )

        second_purchase = Purchase.objects.create(
            supplier=second_supplier,
            invoice_number="REP-FAC-005",
            purchase_date=date(2026, 7, 12),
            currency="CRC",
            status=PurchaseStatus.CONFIRMED,
            created_by=self.user,
            updated_by=self.user,
        )

        PurchaseItem.objects.create(
            purchase=second_purchase,
            supplier_product=second_supplier_product,
            quantity=1,
            unit_cost=Decimal("50.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        first_page = self.client.get(
            "/api/reports/product-supplier-prices/",
            {
                "product": self.product.id,
                "page_size": 1,
            },
        )

        self.assertEqual(first_page.status_code, status.HTTP_200_OK)
        self.assertEqual(first_page.data["count"], 2)
        self.assertEqual(len(first_page.data["results"]), 1)
        self.assertIsNotNone(first_page.data["next"])

        second_page = self.client.get(
            "/api/reports/product-supplier-prices/",
            {
                "product": self.product.id,
                "page_size": 1,
                "page": 2,
            },
        )

        self.assertEqual(second_page.status_code, status.HTTP_200_OK)
        self.assertEqual(len(second_page.data["results"]), 1)
        self.assertIsNone(second_page.data["next"])
