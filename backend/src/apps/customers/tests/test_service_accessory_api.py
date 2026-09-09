from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_CUSTOMERS

from apps.customers.models import (
    Customer,
    CustomerType,
    Injector,
    InjectorServiceAccessory,
    InjectorServiceRecord,
    InjectorServiceStatus,
)
from apps.inventory.models import (
    MovementDirection,
    Product,
    StockMovement,
    StockMovementType,
    StorageLocation,
)
from apps.inventory.selectors import current_stock

User = get_user_model()


class InjectorServiceAccessoryApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="admin",
            password="12345678",
        )

        call_command("setup_roles")

        self.user.groups.add(
            Group.objects.get(name=ROLE_CUSTOMERS),
        )

        self.client.force_authenticate(self.user)

        self.customer = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Juan Pérez",
            identification="123456789",
            created_by=self.user,
            updated_by=self.user,
        )

        self.injector = Injector.objects.create(
            customer=self.customer,
            injector_number="0445110183",
            created_by=self.user,
            updated_by=self.user,
        )

        self.service_record = InjectorServiceRecord.objects.create(
            injector=self.injector,
            received_at=timezone.now(),
            created_by=self.user,
            updated_by=self.user,
        )

        self.location = StorageLocation.objects.create(
            code="A101",
            created_by=self.user,
            updated_by=self.user,
        )

        self.product = Product.objects.create(
            standard_code="FILTRO-001",
            name="Filtro de inyector",
            storage_location=self.location,
            minimum_stock=1,
            unit_of_measure="unidad",
            created_by=self.user,
            updated_by=self.user,
        )

        StockMovement.create_from_service(
            product=self.product,
            movement_type=StockMovementType.INITIAL,
            direction=MovementDirection.IN,
            quantity=5,
            notes="Inventario inicial de prueba.",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_create_service_accessory_discounts_stock(self):
        response = self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
                "product": self.product.id,
                "quantity": 2,
                "notes": "Incluye filtro",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        service_accessory = InjectorServiceAccessory.objects.get(
            id=response.data["id"],
        )

        self.assertEqual(service_accessory.service_record, self.service_record)
        self.assertEqual(service_accessory.product, self.product)
        self.assertEqual(service_accessory.quantity, 2)
        self.assertEqual(service_accessory.notes, "Incluye filtro")
        self.assertEqual(service_accessory.created_by, self.user)

        self.assertEqual(current_stock(self.product), 3)

        movement = StockMovement.objects.get(
            movement_type=StockMovementType.SERVICE_USE,
        )
        self.assertEqual(movement.direction, MovementDirection.OUT)
        self.assertEqual(movement.quantity, 2)
        self.assertEqual(movement.service_accessory, service_accessory)

    def test_create_service_accessory_with_insufficient_stock_returns_400(self):
        response = self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
                "product": self.product.id,
                "quantity": 10,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(InjectorServiceAccessory.objects.count(), 0)
        self.assertEqual(current_stock(self.product), 5)

    def test_list_service_accessories(self):
        response = self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
                "product": self.product.id,
                "quantity": 1,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        response = self.client.get("/api/customers/service-accessories/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

        item = response.data["results"][0]

        self.assertEqual(item["service_record"], self.service_record.id)
        self.assertEqual(item["product"], self.product.id)
        self.assertEqual(item["product_detail"]["standard_code"], "FILTRO-001")

    def test_product_detail_includes_effective_sale_price(self):
        self.product.custom_sale_price = "5000.0000"
        self.product.save(update_fields=["custom_sale_price"])

        response = self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
                "product": self.product.id,
                "quantity": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            response.data["product_detail"]["effective_sale_price"],
            "5000.0000",
        )

    def test_product_detail_effective_sale_price_is_null_without_price(self):
        response = self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
                "product": self.product.id,
                "quantity": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(
            response.data["product_detail"]["effective_sale_price"],
        )

    def test_filter_service_accessories_by_service_record(self):
        other_service_record = InjectorServiceRecord.objects.create(
            injector=self.injector,
            received_at=timezone.now(),
            created_by=self.user,
            updated_by=self.user,
        )

        other_product = Product.objects.create(
            standard_code="EMPAQUE-001",
            name="Empaque",
            storage_location=self.location,
            minimum_stock=1,
            unit_of_measure="unidad",
            created_by=self.user,
            updated_by=self.user,
        )

        StockMovement.create_from_service(
            product=other_product,
            movement_type=StockMovementType.INITIAL,
            direction=MovementDirection.IN,
            quantity=5,
            created_by=self.user,
            updated_by=self.user,
        )

        self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
                "product": self.product.id,
                "quantity": 1,
            },
            format="json",
        )

        self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": other_service_record.id,
                "product": other_product.id,
                "quantity": 1,
            },
            format="json",
        )

        response = self.client.get(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["service_record"],
            self.service_record.id,
        )

    def test_duplicate_service_accessory_returns_400(self):
        self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
                "product": self.product.id,
                "quantity": 1,
            },
            format="json",
        )

        response = self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
                "product": self.product.id,
                "quantity": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            InjectorServiceAccessory.objects.filter(
                service_record=self.service_record,
                product=self.product,
            ).count(),
            1,
        )

    def test_cannot_create_accessory_for_delivered_service(self):
        self.service_record.status = InjectorServiceStatus.DELIVERED
        self.service_record.delivered_at = timezone.now()
        self.service_record.save(
            update_fields=[
                "status",
                "delivered_at",
            ]
        )

        response = self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
                "product": self.product.id,
                "quantity": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_quantity_must_be_positive(self):
        response = self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
                "product": self.product.id,
                "quantity": 0,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delete_service_accessory_reverses_stock(self):
        create_response = self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
                "product": self.product.id,
                "quantity": 2,
            },
            format="json",
        )
        service_accessory_id = create_response.data["id"]

        self.assertEqual(current_stock(self.product), 3)

        response = self.client.delete(
            f"/api/customers/service-accessories/{service_accessory_id}/",
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(
            InjectorServiceAccessory.objects.filter(id=service_accessory_id).exists()
        )
        self.assertEqual(current_stock(self.product), 5)

        reversal = StockMovement.objects.get(
            movement_type=StockMovementType.REVERSAL,
        )
        self.assertEqual(reversal.direction, MovementDirection.IN)
        self.assertEqual(reversal.quantity, 2)
        self.assertIsNone(reversal.service_accessory)

    def test_cannot_delete_accessory_for_delivered_service(self):
        create_response = self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
                "product": self.product.id,
                "quantity": 1,
            },
            format="json",
        )
        service_accessory_id = create_response.data["id"]

        self.service_record.status = InjectorServiceStatus.DELIVERED
        self.service_record.delivered_at = timezone.now()
        self.service_record.save(
            update_fields=[
                "status",
                "delivered_at",
            ]
        )

        response = self.client.delete(
            f"/api/customers/service-accessories/{service_accessory_id}/",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(
            InjectorServiceAccessory.objects.filter(id=service_accessory_id).exists()
        )
        self.assertEqual(current_stock(self.product), 4)

    def test_update_service_accessory_is_not_allowed(self):
        create_response = self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
                "product": self.product.id,
                "quantity": 1,
            },
            format="json",
        )
        service_accessory_id = create_response.data["id"]

        response = self.client.patch(
            f"/api/customers/service-accessories/{service_accessory_id}/",
            {
                "quantity": 3,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
