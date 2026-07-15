from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_INVENTORY

from apps.inventory.models import Supplier

User = get_user_model()


class SupplierApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="admin",
            password="12345678",
        )

        inventory_group, _ = Group.objects.get_or_create(
            name=ROLE_INVENTORY,
        )
        self.user.groups.add(inventory_group)

        self.client.force_authenticate(self.user)

        self.supplier = Supplier.objects.create(
            name="Bosch",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_list_suppliers(self):
        response = self.client.get("/api/inventory/suppliers/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_create_supplier(self):
        response = self.client.post(
            "/api/inventory/suppliers/",
            {
                "name": "Denso",
                "contact_name": "Carlos Mora",
                "country": "Japón",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        supplier = Supplier.objects.get(id=response.data["id"])

        self.assertEqual(supplier.name, "DENSO")
        self.assertEqual(supplier.contact_name, "Carlos Mora")
        self.assertEqual(supplier.country, "Japón")
        self.assertEqual(supplier.created_by, self.user)
        self.assertEqual(supplier.updated_by, self.user)

    def test_update_supplier(self):
        response = self.client.patch(
            f"/api/inventory/suppliers/{self.supplier.id}/",
            {
                "phone": "2222-3333",
                "contact_name": "Ana López",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.supplier.refresh_from_db()

        self.assertEqual(
            self.supplier.phone,
            "2222-3333",
        )
        self.assertEqual(
            self.supplier.contact_name,
            "Ana López",
        )


    def test_search_suppliers_by_visible_fields(self):
        Supplier.objects.create(
            name="Denso",
            contact_name="Carlos Mora",
            country="Japón",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/inventory/suppliers/",
            {
                "q": "Carlos",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["name"],
            "DENSO",
        )

    def test_filter_suppliers_by_active_state(self):
        Supplier.objects.create(
            name="Denso",
            is_active=False,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/inventory/suppliers/",
            {
                "is_active": "false",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["name"],
            "DENSO",
        )
