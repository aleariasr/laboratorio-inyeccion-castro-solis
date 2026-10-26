from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import (
    ROLE_CUSTOMERS,
    ROLE_INVENTORY,
    ROLE_READ_ONLY,
    ROLE_SALES,
)
from apps.customers.models import Customer

User = get_user_model()


class CustomerPermissionApiTest(APITestCase):
    def setUp(self):
        call_command("setup_roles")

        self.customers_user = User.objects.create_user(
            username="customers",
            password="12345678",
        )
        self.customers_user.groups.add(
            Group.objects.get(name=ROLE_CUSTOMERS),
        )

        self.read_only_user = User.objects.create_user(
            username="readonly-customers",
            password="12345678",
        )
        self.read_only_user.groups.add(
            Group.objects.get(name=ROLE_READ_ONLY),
        )

        self.plain_user = User.objects.create_user(
            username="plain-customers",
            password="12345678",
        )

        self.customer = Customer.objects.create(
            customer_type="PERSON",
            display_name="Cliente prueba",
            created_by=self.customers_user,
            updated_by=self.customers_user,
        )

    def test_customers_user_can_create_customer(self):
        self.client.force_authenticate(self.customers_user)

        response = self.client.post(
            "/api/customers/customers/",
            {
                "customer_type": "PERSON",
                "display_name": "Cliente nuevo",
                "identification": "1-1111-1111",
                "phone": "8888-8888",
                "email": "cliente@example.com",
                "notes": "Cliente de prueba",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_read_only_user_can_list_customers(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.get("/api/customers/customers/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_read_only_user_cannot_create_customer(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.post(
            "/api/customers/customers/",
            {
                "customer_type": "PERSON",
                "display_name": "Cliente bloqueado",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_sales_and_inventory_roles_can_search_customers(self):
        # Ventas elige el cliente de una venta e Inventario el de una
        # proforma: los dos buscan con el mismo endpoint que usa la
        # pantalla, ?q= sobre el nombre.
        for role in (ROLE_SALES, ROLE_INVENTORY):
            with self.subTest(role=role):
                user = User.objects.create_user(
                    username=f"customers-lookup-{role.lower()}",
                    password="12345678",
                )
                user.groups.add(Group.objects.get(name=role))
                self.client.force_authenticate(user)

                response = self.client.get(
                    "/api/customers/customers/",
                    {"q": "prueba"},
                )

                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(
                    [row["id"] for row in response.data["results"]],
                    [self.customer.id],
                )

    def test_sales_role_creates_customers_but_does_not_edit_them(self):
        # Punto 7 del plan del 2026-10-22: Ventas crea el cliente desde la
        # venta o la proforma (ventana encima), pero no edita clientes.
        self.customer.refresh_from_db()
        original_name = self.customer.display_name

        user = User.objects.create_user(
            username="customers-sales-create",
            password="12345678",
        )
        user.groups.add(Group.objects.get(name=ROLE_SALES))
        self.client.force_authenticate(user)

        create_response = self.client.post(
            "/api/customers/customers/",
            {
                "customer_type": "PERSON",
                "display_name": "Cliente desde la venta",
            },
            format="json",
        )
        update_response = self.client.patch(
            f"/api/customers/customers/{self.customer.id}/",
            {"display_name": "Cambio bloqueado"},
            format="json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(update_response.status_code, status.HTTP_403_FORBIDDEN)

        self.customer.refresh_from_db()
        self.assertEqual(self.customer.display_name, original_name)

    def test_inventory_role_cannot_create_or_edit_customers(self):
        # El modelo normaliza el nombre al guardar (mayúsculas): se
        # compara contra lo guardado, no contra el texto del setUp.
        self.customer.refresh_from_db()
        original_name = self.customer.display_name

        user = User.objects.create_user(
            username="customers-blocked-inventory",
            password="12345678",
        )
        user.groups.add(Group.objects.get(name=ROLE_INVENTORY))
        self.client.force_authenticate(user)

        create_response = self.client.post(
            "/api/customers/customers/",
            {
                "customer_type": "PERSON",
                "display_name": "Cliente bloqueado",
            },
            format="json",
        )
        update_response = self.client.patch(
            f"/api/customers/customers/{self.customer.id}/",
            {"display_name": "Cambio bloqueado"},
            format="json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(update_response.status_code, status.HTTP_403_FORBIDDEN)

        self.customer.refresh_from_db()
        self.assertEqual(self.customer.display_name, original_name)

    def test_authenticated_user_without_group_cannot_list_customers(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.get("/api/customers/customers/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_user_cannot_list_customers(self):
        response = self.client.get("/api/customers/customers/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
