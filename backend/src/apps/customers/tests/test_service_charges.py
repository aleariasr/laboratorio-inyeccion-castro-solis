from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_ADMIN, ROLE_CUSTOMERS
from apps.customers.models import (
    Customer,
    CustomerType,
    Injector,
    InjectorServiceAccessory,
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
from apps.inventory.selectors import current_stock

User = get_user_model()

LINES_URL = "/api/customers/service-charge-lines/"
ACCESSORIES_URL = "/api/customers/service-accessories/"


class ServiceChargesApiTest(APITestCase):
    """
    Punto 3 + 1B del plan del 2026-10-22: el precio del servicio es la
    suma de las líneas de cobro y los accesorios (cada uno con su precio
    fijado al agregarlo), ya no se acumula, y los accesorios se editan sin
    descuadrar el inventario. Los accesorios se agregan uno por uno, con
    lo que de verdad se usó (el kit se quitó).
    """

    def setUp(self):
        call_command("setup_roles")

        self.admin = User.objects.create_user(username="charges-admin", password="12345678")
        self.admin.groups.add(Group.objects.get(name=ROLE_ADMIN))

        self.operator = User.objects.create_user(
            username="charges-operator",
            password="12345678",
        )
        self.operator.groups.add(Group.objects.get(name=ROLE_CUSTOMERS))

        customer = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Cliente cobro",
            created_by=self.admin,
            updated_by=self.admin,
        )
        injector = Injector.objects.create(
            customer=customer,
            injector_number="COBRO-1",
            created_by=self.admin,
            updated_by=self.admin,
        )
        self.service_record = InjectorServiceRecord.objects.create(
            injector=injector,
            received_at=timezone.now(),
            created_by=self.admin,
            updated_by=self.admin,
        )

        location = StorageLocation.objects.create(
            code="C1",
            created_by=self.admin,
            updated_by=self.admin,
        )

        def product(code, price, stock):
            created = Product.objects.create(
                standard_code=code,
                name=f"Producto {code}",
                storage_location=location,
                custom_sale_price=price,
                created_by=self.admin,
                updated_by=self.admin,
            )
            StockMovement.create_from_service(
                product=created,
                movement_type=StockMovementType.INITIAL,
                direction=MovementDirection.IN,
                quantity=stock,
                notes="Inicial",
                created_by=self.admin,
                updated_by=self.admin,
            )
            return created

        self.filter = product("C-FILTRO", "3500.0000", 10)
        self.oring = product("C-ORING", "500.0000", 3)

        self.service_type = ServiceType.objects.create(
            name="LIMPIEZA COMPLETA",
            default_labor_price=Decimal("15000"),
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.client.force_authenticate(self.admin)

    # -- Ayudas -----------------------------------------------------------

    def add_line(self, **data):
        return self.client.post(
            LINES_URL,
            {"service_record": self.service_record.id, **data},
            format="json",
        )

    def add_accessory(self, product, quantity, **extra):
        return self.client.post(
            ACCESSORIES_URL,
            {
                "service_record": self.service_record.id,
                "product": product.id,
                "quantity": quantity,
                **extra,
            },
            format="json",
        )

    def edit_accessory(self, accessory_id, **data):
        return self.client.patch(
            f"{ACCESSORIES_URL}{accessory_id}/",
            data,
            format="json",
        )

    def price(self):
        self.service_record.refresh_from_db()
        return self.service_record.price

    def active_service_uses(self, product):
        return StockMovement.objects.filter(
            product=product,
            movement_type=StockMovementType.SERVICE_USE,
            reversal_movement__isnull=True,
        )

    # -- Precio: líneas + accesorios -------------------------------------

    def test_price_is_lines_plus_accessories(self):
        self.add_line(service_type=self.service_type.id, unit_price="15000")
        self.add_line(description="Prueba en banco", quantity=4, unit_price="1000")
        self.add_accessory(self.filter, 2)

        # 15 000 + 4 × 1 000 + 2 × 3 500
        self.assertEqual(self.price(), Decimal("26000"))

    def test_line_without_description_takes_the_type_name(self):
        response = self.add_line(service_type=self.service_type.id, unit_price="15000")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["description"], "LIMPIEZA COMPLETA")

        self.service_record.refresh_from_db()
        self.assertEqual(self.service_record.service_type, self.service_type)

        response = self.add_line(unit_price="100")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("description", response.data)

    def test_price_does_not_accumulate(self):
        # El error del punto 3: 100 + 50 se guardaba como precio del tipo
        # y la sugerencia le volvía a sumar los accesorios.
        self.add_line(service_type=self.service_type.id, unit_price="15000")
        self.add_accessory(self.filter, 1)
        self.assertEqual(self.price(), Decimal("18500"))

        for _ in range(3):
            self.client.patch(
                f"/api/customers/service-records/{self.service_record.id}/",
                {"service_type": self.service_type.id, "notes_after": "Listo"},
                format="json",
            )

        self.assertEqual(self.price(), Decimal("18500"))
        self.service_type.refresh_from_db()
        self.assertEqual(self.service_type.default_labor_price, Decimal("15000"))

    def test_accessory_price_is_fixed_when_added(self):
        response = self.add_accessory(self.filter, 1)
        self.assertEqual(Decimal(response.data["unit_price"]), Decimal("3500"))

        self.filter.custom_sale_price = Decimal("9999")
        self.filter.save(update_fields=["custom_sale_price"])
        self.add_line(description="Mano de obra", unit_price="1000")

        self.assertEqual(self.price(), Decimal("4500"))

    def test_admin_can_set_a_different_accessory_price(self):
        created = self.add_accessory(self.filter, 2, unit_price="0")
        self.assertEqual(self.price(), Decimal("0"))

        response = self.edit_accessory(created.data["id"], unit_price="3000")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.price(), Decimal("6000"))
        # Cambiar solo el precio no toca el inventario.
        self.assertEqual(current_stock(self.filter), 8)
        self.assertEqual(self.active_service_uses(self.filter).count(), 1)

    def test_editing_and_removing_lines_recalculates(self):
        line = self.add_line(description="Mano de obra", unit_price="10000").data

        self.client.patch(f"{LINES_URL}{line['id']}/", {"quantity": 2}, format="json")
        self.assertEqual(self.price(), Decimal("20000"))

        self.client.delete(f"{LINES_URL}{line['id']}/")
        self.assertIsNone(self.price())

    def test_service_without_lines_or_accessories_cannot_be_delivered(self):
        self.service_record.status = InjectorServiceStatus.READY
        self.service_record.save(update_fields=["status"])

        response = self.client.post(
            f"/api/customers/service-records/{self.service_record.id}/deliver/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delivered_service_charges_are_locked(self):
        line = self.add_line(description="Mano de obra", unit_price="10000").data
        accessory = self.add_accessory(self.filter, 1).data

        self.service_record.status = InjectorServiceStatus.READY
        self.service_record.save(update_fields=["status"])
        delivery = self.client.post(
            f"/api/customers/service-records/{self.service_record.id}/deliver/",
            {},
            format="json",
        )
        self.assertEqual(delivery.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(delivery.data["total"]), Decimal("13500"))

        attempts = [
            self.add_line(description="Otra", unit_price="1"),
            self.client.patch(f"{LINES_URL}{line['id']}/", {"quantity": 5}, format="json"),
            self.client.delete(f"{LINES_URL}{line['id']}/"),
            self.edit_accessory(accessory["id"], quantity=2),
        ]

        for response in attempts:
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.assertEqual(current_stock(self.filter), 9)

    # -- Inventario al editar accesorios ---------------------------------

    def test_quantity_up_and_down_keeps_stock_exact(self):
        accessory = self.add_accessory(self.filter, 1).data
        self.assertEqual(current_stock(self.filter), 9)

        self.edit_accessory(accessory["id"], quantity=4)
        self.assertEqual(current_stock(self.filter), 6)

        self.edit_accessory(accessory["id"], quantity=2)
        self.assertEqual(current_stock(self.filter), 8)

        # Siempre una sola salida vigente, por la cantidad actual.
        active = self.active_service_uses(self.filter)
        self.assertEqual(active.count(), 1)
        self.assertEqual(active.get().quantity, 2)

    def test_increase_without_enough_stock_changes_nothing(self):
        accessory = self.add_accessory(self.oring, 2).data
        movements_before = StockMovement.objects.count()

        # Hay 3: los 2 que ya tiene + 1 disponible. 4 no alcanza.
        response = self.edit_accessory(accessory["id"], quantity=4)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(current_stock(self.oring), 1)
        self.assertEqual(StockMovement.objects.count(), movements_before)
        self.assertEqual(
            InjectorServiceAccessory.objects.get(id=accessory["id"]).quantity,
            2,
        )

        # 3 sí alcanza (los 2 que tiene + el que queda).
        response = self.edit_accessory(accessory["id"], quantity=3)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(current_stock(self.oring), 0)

    def test_remove_after_edits_returns_everything(self):
        accessory = self.add_accessory(self.filter, 1).data
        self.edit_accessory(accessory["id"], quantity=5)
        self.edit_accessory(accessory["id"], quantity=3)

        response = self.client.delete(f"{ACCESSORIES_URL}{accessory['id']}/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(current_stock(self.filter), 10)
        self.assertEqual(self.active_service_uses(self.filter).count(), 0)

    def test_cancel_after_edits_returns_everything(self):
        accessory = self.add_accessory(self.filter, 2).data
        self.edit_accessory(accessory["id"], quantity=6)

        response = self.client.post(
            f"/api/customers/service-records/{self.service_record.id}/cancel/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(current_stock(self.filter), 10)
        self.assertEqual(self.active_service_uses(self.filter).count(), 0)

    def test_product_cannot_change_on_edit(self):
        accessory = self.add_accessory(self.filter, 1).data

        response = self.edit_accessory(accessory["id"], product=self.oring.id)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("product", response.data)

    # -- Operario ---------------------------------------------------------

    def test_operator_adds_and_edits_accessories_but_not_prices(self):
        self.client.force_authenticate(self.operator)

        created = self.add_accessory(self.filter, 1)
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(created.data["unit_price"])

        edited = self.edit_accessory(created.data["id"], quantity=2)
        self.assertEqual(edited.status_code, status.HTTP_200_OK)
        self.assertEqual(current_stock(self.filter), 8)

        self.add_accessory(self.oring, 1)

        self.assertEqual(self.add_line(description="X", unit_price="1").status_code, 403)
        self.assertEqual(self.client.get(LINES_URL).status_code, 403)

        # El precio igual queda fijado con el de venta.
        self.assertEqual(self.price(), Decimal("7500"))

    def test_invoice_lists_lines_and_accessories(self):
        from unittest import mock

        from reportlab import rl_config

        self.add_line(description="Mano de obra", unit_price="15000")
        self.add_accessory(self.filter, 2)
        self.add_accessory(self.oring, 1, unit_price="0")

        self.service_record.status = InjectorServiceStatus.READY
        self.service_record.save(update_fields=["status"])
        self.client.post(
            f"/api/customers/service-records/{self.service_record.id}/deliver/",
            {},
            format="json",
        )

        with mock.patch.object(rl_config, "pageCompression", 0):
            response = self.client.get(
                f"/api/documents/services/{self.service_record.id}/invoice/"
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        text = b"".join(response.streaming_content).decode("latin-1")

        self.assertIn("(Mano de obra) Tj", text)
        self.assertIn("(CRC 15 000) Tj", text)
        self.assertIn("(CRC 7 000) Tj", text)
        # Un accesorio en 0 sale como incluido.
        self.assertIn("(Incluido) Tj", text)
        self.assertIn("(CRC 22 000) Tj", text)
