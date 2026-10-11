from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import PaymentMethod
from apps.core.permissions import ROLE_ADMIN, ROLE_CUSTOMERS
from apps.customers.models import (
    Customer,
    CustomerType,
    Injector,
    InjectorServiceRecord,
    InjectorServiceStatus,
    ServiceType,
)
from apps.inventory.models import (
    MovementDirection,
    Product,
    StockMovement,
    StockMovementType,
    StorageLocation,
)

User = get_user_model()


class ServicePricingPermissionApiTest(APITestCase):
    """
    Punto 25: el operario (Clientes y servicio) recibe, inicia, marca
    listo, carga datos técnicos y accesorios. El precio, el tipo de
    servicio, el método de pago y la entrega son solo del Administrador,
    y el operario tampoco ve cuánto se cobra.
    """

    def setUp(self):
        call_command("setup_roles")

        self.admin = User.objects.create_user(
            username="pricing-admin",
            password="12345678",
        )
        self.admin.groups.add(Group.objects.get(name=ROLE_ADMIN))

        self.operator = User.objects.create_user(
            username="pricing-operator",
            password="12345678",
        )
        self.operator.groups.add(Group.objects.get(name=ROLE_CUSTOMERS))

        customer = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Cliente servicio",
            created_by=self.admin,
            updated_by=self.admin,
        )

        injector = Injector.objects.create(
            customer=customer,
            injector_number="0445110183",
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.service_type = ServiceType.objects.create(
            name="LIMPIEZA",
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.service_record = InjectorServiceRecord.objects.create(
            injector=injector,
            received_at=timezone.now(),
            price=Decimal("20000.0000"),
            service_type=self.service_type,
            created_by=self.admin,
            updated_by=self.admin,
        )

        location = StorageLocation.objects.create(
            code="A101",
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.product = Product.objects.create(
            standard_code="FILTRO-001",
            name="Filtro de inyector",
            storage_location=location,
            custom_sale_price="3500.0000",
            created_by=self.admin,
            updated_by=self.admin,
        )

        StockMovement.create_from_service(
            product=self.product,
            movement_type=StockMovementType.INITIAL,
            direction=MovementDirection.IN,
            quantity=5,
            notes="Inventario inicial de prueba.",
            created_by=self.admin,
            updated_by=self.admin,
        )

    def service_url(self, suffix=""):
        return (
            f"/api/customers/service-records/{self.service_record.id}/{suffix}"
        )

    def move_to_ready(self):
        self.service_record.status = InjectorServiceStatus.READY
        self.service_record.save(update_fields=["status"])

    # --- Lo que el operario sí hace -------------------------------------

    def test_operator_can_start_and_mark_ready(self):
        self.client.force_authenticate(self.operator)

        start = self.client.post(self.service_url("start/"), {}, format="json")
        ready = self.client.post(
            self.service_url("mark-ready/"),
            {},
            format="json",
        )

        self.assertEqual(start.status_code, status.HTTP_200_OK)
        self.assertEqual(ready.status_code, status.HTTP_200_OK)

    def test_operator_can_save_technical_data(self):
        self.client.force_authenticate(self.operator)

        response = self.client.patch(
            self.service_url(),
            {"resistance": "0.5", "notes_after": "Sin fugas"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_operator_can_resend_unchanged_payment_method(self):
        # Reenviar el valor que ya tiene no es un cambio de cobro.
        self.client.force_authenticate(self.operator)

        response = self.client.patch(
            self.service_url(),
            {"payment_method": PaymentMethod.CASH, "notes_before": "Llegó sucio"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_operator_can_add_accessories(self):
        self.client.force_authenticate(self.operator)

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

    # --- Lo que el operario no hace -------------------------------------

    def test_operator_cannot_change_price_type_or_payment_method(self):
        other_type = ServiceType.objects.create(
            name="REPARACIÓN",
            created_by=self.admin,
            updated_by=self.admin,
        )
        self.client.force_authenticate(self.operator)

        changes = {
            "price": "1.0000",
            "service_type": other_type.id,
            "payment_method": PaymentMethod.CARD,
        }

        for field_name, value in changes.items():
            with self.subTest(field=field_name):
                response = self.client.patch(
                    self.service_url(),
                    {field_name: value},
                    format="json",
                )

                self.assertEqual(
                    response.status_code,
                    status.HTTP_400_BAD_REQUEST,
                )
                self.assertIn(field_name, response.data)

        self.service_record.refresh_from_db()
        self.assertEqual(self.service_record.price, Decimal("20000.0000"))
        self.assertEqual(self.service_record.service_type, self.service_type)
        self.assertEqual(self.service_record.payment_method, PaymentMethod.CASH)

    def test_operator_cannot_deliver(self):
        self.move_to_ready()
        self.client.force_authenticate(self.operator)

        response = self.client.post(self.service_url("deliver/"), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.service_record.refresh_from_db()
        self.assertEqual(self.service_record.status, InjectorServiceStatus.READY)

    def test_operator_does_not_see_price_or_payment_method(self):
        self.client.force_authenticate(self.operator)

        detail = self.client.get(self.service_url())
        listing = self.client.get("/api/customers/service-records/")

        self.assertIsNone(detail.data["price"])
        self.assertIsNone(detail.data["payment_method"])
        self.assertIsNone(listing.data["results"][0]["price"])

    def test_operator_does_not_see_accessory_prices(self):
        self.client.force_authenticate(self.operator)

        created = self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
                "product": self.product.id,
                "quantity": 1,
            },
            format="json",
        )

        self.assertIsNone(created.data["product_detail"]["effective_sale_price"])

    def test_operator_can_read_service_types_but_not_change_them(self):
        self.client.force_authenticate(self.operator)

        listing = self.client.get("/api/customers/service-types/")
        creation = self.client.post(
            "/api/customers/service-types/",
            {"name": "Nuevo tipo"},
            format="json",
        )
        update = self.client.patch(
            f"/api/customers/service-types/{self.service_type.id}/",
            {"description": "Cambio"},
            format="json",
        )

        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertEqual(creation.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(update.status_code, status.HTTP_403_FORBIDDEN)

    def test_operator_cannot_read_price_history(self):
        self.client.force_authenticate(self.operator)

        response = self.client.get("/api/customers/service-type-price-history/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # --- El Administrador ------------------------------------------------

    def test_admin_sees_price_and_accessory_prices(self):
        self.client.force_authenticate(self.admin)

        detail = self.client.get(self.service_url())
        accessory = self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
                "product": self.product.id,
                "quantity": 1,
            },
            format="json",
        )

        self.assertEqual(detail.data["price"], "20000.0000")
        self.assertEqual(detail.data["payment_method"], PaymentMethod.CASH)
        self.assertEqual(
            accessory.data["product_detail"]["effective_sale_price"],
            "3500.0000",
        )

    def test_admin_can_change_price_and_deliver(self):
        self.client.force_authenticate(self.admin)

        price = self.client.patch(
            self.service_url(),
            {"price": "25000.0000", "payment_method": PaymentMethod.CARD},
            format="json",
        )
        self.move_to_ready()
        delivery = self.client.post(self.service_url("deliver/"), {}, format="json")

        self.assertEqual(price.status_code, status.HTTP_200_OK)
        self.assertEqual(delivery.status_code, status.HTTP_200_OK)
        self.service_record.refresh_from_db()
        self.assertEqual(self.service_record.status, InjectorServiceStatus.DELIVERED)
