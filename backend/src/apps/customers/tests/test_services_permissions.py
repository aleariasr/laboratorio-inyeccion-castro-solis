from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import (
    ROLE_CUSTOMERS,
    ROLE_READ_ONLY,
)
from apps.customers.models import Customer, Injector, InjectorServiceRecord

User = get_user_model()


def _module_permission(codename):
    return Permission.objects.get(
        content_type__app_label="core",
        content_type__model="modulepermissions",
        codename=codename,
    )


class ServicesPermissionApiTest(APITestCase):
    def setUp(self):
        call_command("setup_roles")

        self.customers_user = User.objects.create_user(
            username="services-customers",
            password="12345678",
        )
        self.customers_user.groups.add(
            Group.objects.get(name=ROLE_CUSTOMERS),
        )

        self.read_only_user = User.objects.create_user(
            username="services-readonly",
            password="12345678",
        )
        self.read_only_user.groups.add(
            Group.objects.get(name=ROLE_READ_ONLY),
        )

        self.plain_user = User.objects.create_user(
            username="services-plain",
            password="12345678",
        )

        self.customer = Customer.objects.create(
            display_name="Cliente servicios",
            created_by=self.customers_user,
            updated_by=self.customers_user,
        )

        self.injector = Injector.objects.create(
            customer=self.customer,
            injector_number="INY-SERV-001",
            created_by=self.customers_user,
            updated_by=self.customers_user,
        )

        # Servicio recién recibido (RECEIVED): alcanza para probar
        # create/change/cancel sin tener que pasar por start/mark
        # ready/deliver, que no es lo que este archivo prueba.
        self.service_record = InjectorServiceRecord.objects.create(
            injector=self.injector,
            received_at=timezone.now(),
            created_by=self.customers_user,
            updated_by=self.customers_user,
        )

    def _user_with_permission(self, codename, username):
        user = User.objects.create_user(
            username=username,
            password="12345678",
        )
        user.user_permissions.add(_module_permission(codename))
        return user

    def test_customers_user_can_create_service_record(self):
        self.client.force_authenticate(self.customers_user)

        response = self.client.post(
            "/api/customers/service-records/",
            {
                "injector": self.injector.id,
                "received_at": timezone.now().isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_read_only_user_can_list_service_records(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.get("/api/customers/service-records/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_read_only_user_cannot_create_service_record(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.post(
            "/api/customers/service-records/",
            {
                "injector": self.injector.id,
                "received_at": timezone.now().isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticated_user_without_group_cannot_list_service_records(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.get("/api/customers/service-records/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_user_cannot_list_service_records(self):
        response = self.client.get("/api/customers/service-records/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_customers_user_can_cancel_received_service(self):
        self.client.force_authenticate(self.customers_user)

        response = self.client.post(
            f"/api/customers/service-records/{self.service_record.id}/cancel/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_user_with_only_change_services_permission_cannot_cancel(self):
        user = self._user_with_permission(
            "change_services",
            "services-change-only",
        )
        self.client.force_authenticate(user)

        response = self.client.post(
            f"/api/customers/service-records/{self.service_record.id}/cancel/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_with_only_cancel_services_permission_can_cancel_but_not_update(self):
        user = self._user_with_permission(
            "cancel_services",
            "services-cancel-only",
        )
        self.client.force_authenticate(user)

        update_response = self.client.patch(
            f"/api/customers/service-records/{self.service_record.id}/",
            {"observations": "Intento de edición"},
            format="json",
        )

        self.assertEqual(update_response.status_code, status.HTTP_403_FORBIDDEN)

        cancel_response = self.client.post(
            f"/api/customers/service-records/{self.service_record.id}/cancel/",
            {},
            format="json",
        )

        self.assertEqual(cancel_response.status_code, status.HTTP_200_OK)

    def test_read_only_user_cannot_cancel_service(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.post(
            f"/api/customers/service-records/{self.service_record.id}/cancel/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
