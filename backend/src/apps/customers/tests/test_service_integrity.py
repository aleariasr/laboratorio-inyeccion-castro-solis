from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_ADMIN, ROLE_CUSTOMERS
from apps.customers.exceptions import ServiceNotEditableError
from apps.customers.models import (
    Customer,
    CustomerType,
    Injector,
    InjectorServiceRecord,
    InjectorServiceStatus,
)
from apps.customers.services import (
    add_charge_line,
    add_service_accessory,
    deliver_service,
    remove_service_accessory,
)
from apps.inventory.models import Product, StorageLocation
from apps.inventory.selectors import current_stock
from apps.inventory.services import initial_inventory

User = get_user_model()

SERVICES_URL = "/api/customers/service-records/"


class ServiceIntegrityTest(APITestCase):
    """
    Pasada previa a la 2.5.0 (2026-10-27): lo que la pantalla no permite
    tampoco lo permite la API, y lo que falla responde un aviso, no un
    error 500.
    """

    def setUp(self):
        call_command("setup_roles")

        self.admin = User.objects.create_user(username="integridad-admin", password="12345678")
        self.admin.groups.add(Group.objects.get(name=ROLE_ADMIN))

        self.operator = User.objects.create_user(
            username="integridad-operario",
            password="12345678",
        )
        self.operator.groups.add(Group.objects.get(name=ROLE_CUSTOMERS))

        self.customer = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Cliente integridad",
            created_by=self.admin,
            updated_by=self.admin,
        )
        self.injector = Injector.objects.create(
            customer=self.customer,
            injector_number="INT-1",
            created_by=self.admin,
            updated_by=self.admin,
        )
        self.service_record = InjectorServiceRecord.objects.create(
            injector=self.injector,
            received_at=timezone.now(),
            created_by=self.admin,
            updated_by=self.admin,
        )

        location = StorageLocation.objects.create(
            code="I1",
            created_by=self.admin,
            updated_by=self.admin,
        )
        self.product = Product.objects.create(
            standard_code="INT-FILTRO",
            name="Filtro integridad",
            storage_location=location,
            custom_sale_price=Decimal("500"),
            created_by=self.admin,
            updated_by=self.admin,
        )
        initial_inventory(product=self.product, quantity=5, user=self.admin)

        self.client.force_authenticate(self.admin)

    def test_a_service_cannot_be_deleted_only_cancelled(self):
        for user in (self.operator, self.admin):
            self.client.force_authenticate(user)

            response = self.client.delete(f"{SERVICES_URL}{self.service_record.id}/")

            self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        self.assertTrue(
            InjectorServiceRecord.objects.filter(pk=self.service_record.pk).exists()
        )

    def test_delivering_with_an_old_copy_charges_what_the_service_has_now(self):
        stale = InjectorServiceRecord.objects.get(pk=self.service_record.pk)
        InjectorServiceRecord.objects.filter(pk=stale.pk).update(
            status=InjectorServiceStatus.READY,
        )
        stale.status = InjectorServiceStatus.READY

        add_charge_line(
            service_record=self.service_record,
            description="Mano de obra",
            quantity=1,
            unit_price=Decimal("10000"),
            user=self.admin,
        )
        add_service_accessory(
            service_record=self.service_record,
            product=self.product,
            quantity=1,
            notes="",
            user=self.admin,
        )

        # `stale` no sabe de la línea ni del accesorio (price None).
        delivered = deliver_service(
            service_record=stale,
            delivered_at=timezone.now(),
            user=self.admin,
        )

        self.assertEqual(delivered.subtotal_amount, Decimal("10500"))

    def test_removing_an_accessory_twice_is_a_notice_and_returns_stock_once(self):
        accessory = add_service_accessory(
            service_record=self.service_record,
            product=self.product,
            quantity=2,
            notes="",
            user=self.admin,
        )

        remove_service_accessory(service_accessory=accessory, user=self.admin)

        with self.assertRaises(ServiceNotEditableError):
            remove_service_accessory(service_accessory=accessory, user=self.admin)

        self.assertEqual(current_stock(self.product), 5)

    def test_a_service_total_that_does_not_fit_is_rejected_without_saving(self):
        response = self.client.post(
            "/api/customers/service-charge-lines/",
            {
                "service_record": self.service_record.id,
                "description": "Desproporcionado",
                "quantity": 1000000,
                "unit_price": "99999999",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("superaría", response.data["detail"])

        self.service_record.refresh_from_db()

        self.assertIsNone(self.service_record.price)
        self.assertFalse(self.service_record.charge_lines.exists())

    def test_reception_date_cannot_be_in_the_future(self):
        future = (timezone.now() + timedelta(days=30)).isoformat()

        reception = self.client.post(
            f"{SERVICES_URL}receive/",
            {"received_at": future, "items": [{"injector": self.injector.id}]},
            format="json",
        )
        correction = self.client.patch(
            f"{SERVICES_URL}{self.service_record.id}/",
            {"received_at": future},
            format="json",
        )

        self.assertEqual(reception.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("received_at", reception.data)
        self.assertEqual(correction.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("received_at", correction.data)

    def test_correcting_the_reception_keeps_the_same_customer(self):
        other_customer = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Otro cliente",
            created_by=self.admin,
            updated_by=self.admin,
        )
        foreign_injector = Injector.objects.create(
            customer=other_customer,
            injector_number="INT-OTRO",
            created_by=self.admin,
            updated_by=self.admin,
        )
        same_customer_injector = Injector.objects.create(
            customer=self.customer,
            injector_number="INT-2",
            created_by=self.admin,
            updated_by=self.admin,
        )

        foreign = self.client.patch(
            f"{SERVICES_URL}{self.service_record.id}/",
            {"injector": foreign_injector.id},
            format="json",
        )
        same = self.client.patch(
            f"{SERVICES_URL}{self.service_record.id}/",
            {"injector": same_customer_injector.id},
            format="json",
        )

        self.assertEqual(foreign.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("injector", foreign.data)
        self.assertEqual(same.status_code, status.HTTP_200_OK)

    def test_deleting_a_customer_with_history_is_a_notice_not_an_error(self):
        with_history = self.client.delete(f"/api/customers/customers/{self.customer.id}/")

        unused = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Cliente sin historial",
            created_by=self.admin,
            updated_by=self.admin,
        )
        without_history = self.client.delete(f"/api/customers/customers/{unused.id}/")

        self.assertEqual(with_history.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("registros asociados", with_history.data["detail"])
        self.assertTrue(Customer.objects.filter(pk=self.customer.pk).exists())
        self.assertEqual(without_history.status_code, status.HTTP_204_NO_CONTENT)
