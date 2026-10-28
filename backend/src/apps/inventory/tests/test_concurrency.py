import threading
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TransactionTestCase
from django.utils import timezone

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
)
from apps.inventory.models import (
    InventoryCount,
    InventoryCountItem,
    Product,
    StorageLocation,
)
from apps.inventory.selectors import current_stock
from apps.inventory.services import approve_inventory_count, initial_inventory
from apps.sales.models import Sale, SaleItem
from apps.sales.services import confirm_sale

User = get_user_model()


def run_at_once(*calls):
    """
    Corre las llamadas en hilos que arrancan juntos, cada uno con su
    propia conexión a la base (como dos pantallas a la vez). Devuelve, por
    llamada, ("ok", resultado) o ("error", excepción).
    """

    barrier = threading.Barrier(len(calls))
    results = [None] * len(calls)

    def runner(index, call):
        try:
            barrier.wait()
            results[index] = ("ok", call())
        except Exception as exc:  # noqa: BLE001 — se compara en el test
            results[index] = ("error", exc)
        finally:
            connection.close()

    threads = [
        threading.Thread(target=runner, args=(index, call))
        for index, call in enumerate(calls)
    ]

    for thread in threads:
        thread.start()

    for thread in threads:
        thread.join()

    return results


class ConcurrentStockOperationsTest(TransactionTestCase):
    """
    Pasada previa a la 2.5.0 (2026-10-27): dos operaciones sobre el mismo
    stock o el mismo documento al mismo tiempo. Antes, dos ventas por todo
    el stock confirmadas a la vez lo dejaban en negativo, un conteo
    aprobado dos veces registraba el ajuste dos veces y un accesorio
    agregado mientras se entregaba el servicio salía del inventario sin
    cobrarse. Ahora el documento y los productos se bloquean (ver
    apps/core/locking.py y lock_products).
    """

    def setUp(self):
        self.user = User.objects.create_user(username="carreras", password="12345678")

        location = StorageLocation.objects.create(
            code="A1",
            created_by=self.user,
            updated_by=self.user,
        )

        self.product = Product.objects.create(
            standard_code="CARRERA-1",
            name="Producto en carrera",
            storage_location=location,
            custom_sale_price=Decimal("500"),
            created_by=self.user,
            updated_by=self.user,
        )

        initial_inventory(product=self.product, quantity=5, user=self.user)

    def draft_sale(self, quantity):
        sale = Sale.objects.create(
            sale_date=date.today(),
            currency="CRC",
            created_by=self.user,
            updated_by=self.user,
        )
        SaleItem.objects.create(
            sale=sale,
            product=self.product,
            quantity=quantity,
            unit_price=100,
            created_by=self.user,
            updated_by=self.user,
        )

        return sale

    def test_two_sales_for_all_the_stock_never_leave_it_negative(self):
        first = self.draft_sale(5)
        second = self.draft_sale(5)

        results = run_at_once(
            lambda: confirm_sale(sale=first, user=self.user),
            lambda: confirm_sale(sale=second, user=self.user),
        )

        self.assertEqual(sorted(outcome for outcome, _ in results), ["error", "ok"])
        self.assertEqual(current_stock(self.product), 0)

    def test_count_approved_twice_at_once_adjusts_only_once(self):
        inventory_count = InventoryCount.objects.create(
            reference="CONTEO-CARRERA",
            count_date=date.today(),
            created_by=self.user,
            updated_by=self.user,
        )
        InventoryCountItem.objects.create(
            inventory_count=inventory_count,
            product=self.product,
            counted_quantity=7,
            created_by=self.user,
            updated_by=self.user,
        )

        results = run_at_once(
            lambda: approve_inventory_count(inventory_count=inventory_count, user=self.user),
            lambda: approve_inventory_count(inventory_count=inventory_count, user=self.user),
        )

        self.assertEqual(sorted(outcome for outcome, _ in results), ["error", "ok"])
        self.assertEqual(current_stock(self.product), 7)

    def test_accessory_added_while_delivering_is_charged_or_rejected(self):
        customer = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Cliente carrera",
            created_by=self.user,
            updated_by=self.user,
        )
        injector = Injector.objects.create(
            customer=customer,
            injector_number="CARRERA-INY",
            created_by=self.user,
            updated_by=self.user,
        )
        service_record = InjectorServiceRecord.objects.create(
            injector=injector,
            received_at=timezone.now(),
            status=InjectorServiceStatus.READY,
            created_by=self.user,
            updated_by=self.user,
        )
        add_charge_line(
            service_record=service_record,
            description="Mano de obra",
            quantity=1,
            unit_price=Decimal("10000"),
            user=self.user,
        )

        run_at_once(
            lambda: deliver_service(
                service_record=service_record,
                delivered_at=timezone.now(),
                user=self.user,
            ),
            lambda: add_service_accessory(
                service_record=service_record,
                product=self.product,
                quantity=1,
                notes="",
                user=self.user,
            ),
        )

        service_record.refresh_from_db()
        accessories = service_record.accessories.count()

        self.assertEqual(service_record.status, InjectorServiceStatus.DELIVERED)
        # Lo que salió del inventario es lo que se cobró: o el accesorio
        # entró antes de entregar (y está en el total) o se rechazó.
        self.assertEqual(
            service_record.subtotal_amount,
            Decimal("10000") + Decimal("500") * accessories,
        )
        self.assertEqual(current_stock(self.product), 5 - accessories)
