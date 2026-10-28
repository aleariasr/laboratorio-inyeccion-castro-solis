from datetime import date
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_ADMIN
from apps.inventory.models import Product, StorageLocation
from apps.inventory.selectors import current_stock
from apps.inventory.services import initial_inventory
from apps.sales.models import Sale, SaleItem, SaleStatus
from apps.sales.serializers import SaleSerializer
from apps.sales.services import confirm_sale
from apps.sales.views import SaleViewSet

User = get_user_model()


class SaleIntegrityTest(APITestCase):
    """
    Pasada previa a la 2.5.0 (2026-10-27): una venta confirmada no vuelve
    a borrador ni recibe líneas por otra vía.
    """

    def setUp(self):
        call_command("setup_roles")

        self.user = User.objects.create_user(username="ventas-integridad", password="12345678")
        self.user.groups.add(Group.objects.get(name=ROLE_ADMIN))

        location = StorageLocation.objects.create(
            code="V1",
            created_by=self.user,
            updated_by=self.user,
        )
        self.product = Product.objects.create(
            standard_code="V-INT",
            name="Producto venta integridad",
            storage_location=location,
            created_by=self.user,
            updated_by=self.user,
        )
        initial_inventory(product=self.product, quantity=10, user=self.user)

        self.other_product = Product.objects.create(
            standard_code="V-INT-2",
            name="Otro producto venta integridad",
            storage_location=location,
            created_by=self.user,
            updated_by=self.user,
        )

        self.client.force_authenticate(self.user)

    def sale_with_line(self, quantity=1, product=None):
        sale = Sale.objects.create(
            sale_date=date.today(),
            currency="CRC",
            created_by=self.user,
            updated_by=self.user,
        )
        item = SaleItem.objects.create(
            sale=sale,
            product=product or self.product,
            quantity=quantity,
            unit_price=100,
            created_by=self.user,
            updated_by=self.user,
        )

        return sale, item

    def test_saving_an_old_copy_does_not_return_a_confirmed_sale_to_draft(self):
        sale, _item = self.sale_with_line()

        # El guardado se validó con la venta en borrador...
        serializer = SaleSerializer(
            Sale.objects.get(pk=sale.pk),
            data={"notes": "Guardado tardío"},
            partial=True,
        )
        serializer.is_valid(raise_exception=True)

        # ...pero la venta se confirmó antes de que se escribiera.
        confirm_sale(sale=sale, user=self.user)

        view = SaleViewSet()
        view.request = SimpleNamespace(user=self.user)

        with self.assertRaises(ValidationError):
            view.perform_update(serializer)

        sale.refresh_from_db()

        self.assertEqual(sale.status, SaleStatus.CONFIRMED)
        self.assertEqual(current_stock(self.product), 9)

    def test_a_line_cannot_move_to_another_sale(self):
        confirmed, _ = self.sale_with_line()
        confirm_sale(sale=confirmed, user=self.user)
        # Otro producto: con el mismo, la regla de un producto por venta
        # responde antes y no se llega a probar el cambio de venta.
        _draft, line = self.sale_with_line(product=self.other_product)

        response = self.client.patch(
            f"/api/sales/sale-items/{line.id}/",
            {"sale": confirmed.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("sale", response.data)
        self.assertEqual(confirmed.items.count(), 1)

    def test_confirming_twice_answers_with_a_sentence(self):
        sale, _ = self.sale_with_line()

        self.client.post(f"/api/sales/sales/{sale.id}/confirm/")
        response = self.client.post(f"/api/sales/sales/{sale.id}/confirm/")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "La venta ya fue confirmada.")
