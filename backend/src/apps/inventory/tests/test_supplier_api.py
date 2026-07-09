from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.inventory.models import Supplier

User = get_user_model()


class SupplierApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="admin",
            password="12345678",
        )

        self.client.force_authenticate(self.user)

        self.supplier = Supplier.objects.create(
            name="Bosch",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_list_suppliers(self):
        response = self.client.get("/api/inventory/suppliers/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

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