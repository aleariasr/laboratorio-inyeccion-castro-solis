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