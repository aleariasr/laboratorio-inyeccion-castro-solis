from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.customers.models import InjectorAccessory

User = get_user_model()


class InjectorAccessoryApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="admin",
            password="12345678",
        )

        self.client.force_authenticate(self.user)

        self.accessory = InjectorAccessory.objects.create(
            name="Filtro",
            description="Filtro de prueba",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_list_accessories(self):
        response = self.client.get("/api/customers/accessories/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        item = response.data[0]

        self.assertEqual(item["name"], "FILTRO")
        self.assertEqual(item["description"], "Filtro de prueba")

    def test_create_accessory(self):
        response = self.client.post(
            "/api/customers/accessories/",
            {
                "name": "empaque",
                "description": "Empaque de inyector",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        accessory = InjectorAccessory.objects.get(id=response.data["id"])

        self.assertEqual(accessory.name, "EMPAQUE")
        self.assertEqual(accessory.description, "Empaque de inyector")
        self.assertEqual(accessory.created_by, self.user)
        self.assertEqual(accessory.updated_by, self.user)

    def test_duplicate_accessory_returns_400(self):
        response = self.client.post(
            "/api/customers/accessories/",
            {
                "name": "filtro",
                "description": "Duplicado",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.assertEqual(
            InjectorAccessory.objects.filter(name="FILTRO").count(),
            1,
        )

    def test_update_accessory(self):
        response = self.client.patch(
            f"/api/customers/accessories/{self.accessory.id}/",
            {
                "name": "filtro actualizado",
                "description": "Descripción actualizada",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.accessory.refresh_from_db()

        self.assertEqual(self.accessory.name, "FILTRO ACTUALIZADO")
        self.assertEqual(
            self.accessory.description,
            "Descripción actualizada",
        )
        self.assertEqual(self.accessory.updated_by, self.user)