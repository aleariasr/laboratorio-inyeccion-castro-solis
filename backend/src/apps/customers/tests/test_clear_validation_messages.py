"""
Auditoría integral del 2026-11-07: mensajes claros para inyectores y
accesorios repetidos (antes "Los campos customer, injector_number deben
formar un conjunto único.") y para los cambios de estado no permitidos
(antes "No se puede cambiar de RECEIVED a READY.").
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_ADMIN
from apps.customers.models import (
    Customer,
    Injector,
    InjectorServiceAccessory,
    InjectorServiceRecord,
)
from apps.inventory.models import Product, StorageLocation
from apps.inventory.services import initial_inventory

User = get_user_model()


class CustomersClearMessagesTest(APITestCase):
    def setUp(self):
        call_command("setup_roles")

        self.user = User.objects.create_user(
            username="customers-messages-admin",
            password="12345678",
        )
        self.user.groups.add(Group.objects.get(name=ROLE_ADMIN))
        self.client.force_authenticate(self.user)

        self.customer = Customer.objects.create(
            display_name="Cliente prueba",
            created_by=self.user,
            updated_by=self.user,
        )
        self.injector = Injector.objects.create(
            customer=self.customer,
            injector_number="0445110183",
            created_by=self.user,
            updated_by=self.user,
        )
        self.service = InjectorServiceRecord.objects.create(
            injector=self.injector,
            received_at=timezone.now(),
            created_by=self.user,
            updated_by=self.user,
        )

        location = StorageLocation.objects.create(
            code="A101",
            created_by=self.user,
            updated_by=self.user,
        )
        self.product = Product.objects.create(
            standard_code="P-001",
            name="Tobera",
            storage_location=location,
            custom_sale_price=Decimal("2500.0000"),
            created_by=self.user,
            updated_by=self.user,
        )
        initial_inventory(product=self.product, quantity=10, user=self.user)

    def test_repeated_injector_number_for_the_same_customer(self):
        response = self.client.post(
            "/api/customers/injectors/",
            {"customer": self.customer.id, "injector_number": " 0445110183 "},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["injector_number"],
            ["Este cliente ya tiene un inyector con ese número."],
        )

    def test_repeated_accessory_in_a_service(self):
        InjectorServiceAccessory.objects.create(
            service_record=self.service,
            product=self.product,
            quantity=1,
            unit_price=Decimal("2500.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.post(
            "/api/customers/service-accessories/",
            {"service_record": self.service.id, "product": self.product.id, "quantity": 1},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["non_field_errors"],
            [
                "Este producto ya está registrado como accesorio en el servicio; "
                "se cambia su cantidad."
            ],
        )

    def test_invalid_transition_uses_status_labels(self):
        response = self.client.post(
            f"/api/customers/service-records/{self.service.id}/mark-ready/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "Un servicio en estado «Recibido» no puede pasar a «Listo».",
        )
