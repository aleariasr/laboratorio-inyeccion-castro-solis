from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.money import DEFAULT_TAX_PERCENTAGE
from apps.core.permissions import (
    ROLE_ADMIN,
    ROLE_CUSTOMERS,
    ROLE_READ_ONLY,
    ROLE_SALES,
)
from apps.customers.models import (
    Customer,
    CustomerType,
    Injector,
    InjectorServiceRecord,
    InjectorServiceStatus,
    ServiceType,
)
from apps.customers.serializers import MAX_RECEPTION_INJECTORS

User = get_user_model()

RECEIVE_URL = "/api/customers/service-records/receive/"


class ServiceReceptionApiTest(APITestCase):
    """Punto 1C del plan del 2026-10-22: recibir varios inyectores a la vez."""

    def setUp(self):
        call_command("setup_roles")

        self.admin = self._user("reception-admin", ROLE_ADMIN)
        self.operator = self._user("reception-operator", ROLE_CUSTOMERS)

        self.customer = self._customer("Taller Rojas")
        self.other_customer = self._customer("Taller Vargas")

        self.injector_a = self._injector(self.customer, "0445110110")
        self.injector_b = self._injector(self.customer, "0445110111")
        self.other_injector = self._injector(self.other_customer, "9308-621C")

        self.service_type = ServiceType.objects.create(
            name="Limpieza general",
            created_by=self.admin,
            updated_by=self.admin,
        )

    def _user(self, username, role):
        user = User.objects.create_user(username=username, password="12345678")
        user.groups.add(Group.objects.get(name=role))
        return user

    def _customer(self, name):
        return Customer.objects.create(
            customer_type=CustomerType.COMPANY,
            display_name=name,
            created_by=self.admin,
            updated_by=self.admin,
        )

    def _injector(self, customer, number):
        return Injector.objects.create(
            customer=customer,
            injector_number=number,
            created_by=self.admin,
            updated_by=self.admin,
        )

    def _receive(self, user, items, **extra):
        self.client.force_authenticate(user)

        return self.client.post(
            RECEIVE_URL,
            {"received_at": "2026-10-26T09:30:00-06:00", "items": items, **extra},
            format="json",
        )

    def test_operator_receives_several_injectors_of_the_same_customer(self):
        response = self._receive(
            self.operator,
            [
                {"injector": self.injector_a.id, "notes_before": "  Gotea al apagar  "},
                {"injector": self.injector_b.id},
            ],
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(len(response.data), 2)

        records = InjectorServiceRecord.objects.order_by("id")

        self.assertEqual(
            [record.injector_id for record in records],
            [self.injector_a.id, self.injector_b.id],
        )
        self.assertEqual(records[0].notes_before, "Gotea al apagar")
        self.assertEqual(records[1].notes_before, "")
        self.assertTrue(all(record.status == InjectorServiceStatus.RECEIVED for record in records))
        self.assertTrue(all(record.tax_percentage == DEFAULT_TAX_PERCENTAGE for record in records))
        self.assertTrue(all(record.created_by == self.operator for record in records))
        self.assertTrue(all(record.service_type is None for record in records))

    def test_administrator_sets_the_service_type_for_all(self):
        response = self._receive(
            self.admin,
            [{"injector": self.injector_a.id}, {"injector": self.injector_b.id}],
            service_type=self.service_type.id,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(
            set(InjectorServiceRecord.objects.values_list("service_type_id", flat=True)),
            {self.service_type.id},
        )

    def test_operator_cannot_set_the_service_type(self):
        response = self._receive(
            self.operator,
            [{"injector": self.injector_a.id}],
            service_type=self.service_type.id,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("service_type", response.data)
        self.assertFalse(InjectorServiceRecord.objects.exists())

    def test_invalid_receptions_create_nothing(self):
        inactive = self._injector(self.customer, "INACTIVO-1")
        Injector.objects.filter(pk=inactive.pk).update(is_active=False)

        cases = {
            "sin inyectores": [],
            "repetido": [{"injector": self.injector_a.id}, {"injector": self.injector_a.id}],
            "otro cliente": [{"injector": self.injector_a.id}, {"injector": self.other_injector.id}],
            "inactivo": [{"injector": inactive.id}],
            "no existe": [{"injector": 999999}],
        }

        for name, items in cases.items():
            with self.subTest(case=name):
                response = self._receive(self.operator, items)

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("items", response.data)
                self.assertFalse(InjectorServiceRecord.objects.exists())

    def test_limit_of_injectors(self):
        items = [
            {"injector": self._injector(self.customer, f"LOTE-{index}").id}
            for index in range(MAX_RECEPTION_INJECTORS + 1)
        ]

        response = self._receive(self.operator, items)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(str(MAX_RECEPTION_INJECTORS), response.data["items"][0])

    def test_reception_is_atomic(self):
        from apps.customers.services import service_record

        original = service_record.receive_injector
        calls = {"count": 0}

        def fail_on_second(**kwargs):
            calls["count"] += 1

            if calls["count"] == 2:
                raise RuntimeError("falla simulada")

            return original(**kwargs)

        self.client.raise_request_exception = False

        with mock.patch.object(service_record, "receive_injector", side_effect=fail_on_second):
            response = self._receive(
                self.operator,
                [{"injector": self.injector_a.id}, {"injector": self.injector_b.id}],
            )

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertFalse(InjectorServiceRecord.objects.exists())

    def test_requires_permission_to_create_services(self):
        for role in (ROLE_SALES, ROLE_READ_ONLY):
            with self.subTest(role=role):
                response = self._receive(
                    self._user(f"reception-{role.lower()}", role),
                    [{"injector": self.injector_a.id}],
                )

                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.assertFalse(InjectorServiceRecord.objects.exists())
