from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_ADMIN, ROLE_INVENTORY, ROLE_READ_ONLY
from apps.core.views.reports import most_moved_products_results
from apps.inventory.models import (
    Branch,
    MovementDirection,
    Product,
    StockMovement,
    StockMovementType,
    StockTransfer,
    StockTransferStatus,
    StorageLocation,
)
from apps.inventory.selectors import current_stock

User = get_user_model()


class StockTransferApiTest(APITestCase):
    """Punto 6 del plan del 2026-10-22: traslados a otra sede."""

    transfers_url = "/api/inventory/stock-transfers/"
    items_url = "/api/inventory/stock-transfer-items/"

    def setUp(self):
        call_command("setup_roles")

        self.user = User.objects.create_user(username="transfers-admin", password="12345678")
        self.user.groups.add(Group.objects.get(name=ROLE_ADMIN))
        self.client.force_authenticate(self.user)

        self.location = StorageLocation.objects.create(
            code="A1",
            created_by=self.user,
            updated_by=self.user,
        )
        self.nozzle = self._product("TOB-1", "Tobera", stock=10)
        self.valve = self._product("VAL-1", "Válvula", stock=3)

        # La crea la migración inventory/0029.
        self.branch = Branch.objects.get(name="Otra sede")

    def _product(self, code, name, *, stock):
        product = Product.objects.create(
            standard_code=code,
            name=name,
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

        StockMovement.create_from_service(
            product=product,
            movement_type=StockMovementType.INITIAL,
            direction=MovementDirection.IN,
            quantity=stock,
            notes="Inventario inicial de prueba.",
            created_by=self.user,
            updated_by=self.user,
        )

        return product

    def _create_transfer(self, lines):
        response = self.client.post(
            self.transfers_url,
            {"branch": self.branch.id, "transfer_date": "2026-10-25", "notes": "Pedido de la sede"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        transfer_id = response.data["id"]

        for product, quantity in lines:
            item_response = self.client.post(
                self.items_url,
                {"stock_transfer": transfer_id, "product": product.id, "quantity": quantity},
                format="json",
            )
            self.assertEqual(item_response.status_code, status.HTTP_201_CREATED, item_response.data)

        return transfer_id

    def _confirm(self, transfer_id):
        return self.client.post(f"{self.transfers_url}{transfer_id}/confirm/", format="json")

    def _cancel(self, transfer_id, reason=""):
        return self.client.post(
            f"{self.transfers_url}{transfer_id}/cancel/",
            {"reason": reason},
            format="json",
        )

    def test_confirm_takes_the_stock_out(self):
        transfer_id = self._create_transfer([(self.nozzle, 4), (self.valve, 3)])

        response = self._confirm(transfer_id)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["status"], StockTransferStatus.CONFIRMED)
        self.assertEqual(response.data["total_quantity"], 7)
        self.assertEqual(response.data["confirmed_by_username"], "transfers-admin")
        self.assertEqual(current_stock(self.nozzle), 6)
        self.assertEqual(current_stock(self.valve), 0)

        movements = StockMovement.objects.filter(movement_type=StockMovementType.TRANSFER_OUT)

        self.assertEqual(movements.count(), 2)
        self.assertTrue(all(m.direction == MovementDirection.OUT for m in movements))

    def test_without_enough_stock_nothing_moves(self):
        transfer_id = self._create_transfer([(self.nozzle, 4), (self.valve, 5)])

        response = self._confirm(transfer_id)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("VAL-1", response.data["detail"])
        self.assertIn("hay 3", response.data["detail"])
        self.assertEqual(StockTransfer.objects.get(pk=transfer_id).status, StockTransferStatus.DRAFT)
        self.assertEqual(current_stock(self.nozzle), 10)
        self.assertFalse(
            StockMovement.objects.filter(movement_type=StockMovementType.TRANSFER_OUT).exists()
        )

    def test_confirm_without_items_or_twice_fails(self):
        empty_id = self._create_transfer([])

        self.assertEqual(self._confirm(empty_id).status_code, status.HTTP_400_BAD_REQUEST)

        transfer_id = self._create_transfer([(self.nozzle, 1)])
        self._confirm(transfer_id)

        self.assertEqual(self._confirm(transfer_id).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(current_stock(self.nozzle), 9)

    def test_confirm_with_inactive_branch_fails(self):
        transfer_id = self._create_transfer([(self.nozzle, 1)])
        Branch.objects.filter(pk=self.branch.pk).update(is_active=False)

        response = self._confirm(transfer_id)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(current_stock(self.nozzle), 10)

    def test_cancel_confirmed_returns_everything_and_needs_a_reason(self):
        transfer_id = self._create_transfer([(self.nozzle, 4), (self.valve, 3)])
        self._confirm(transfer_id)

        without_reason = self._cancel(transfer_id, "  ")

        self.assertEqual(without_reason.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(current_stock(self.nozzle), 6)

        response = self._cancel(transfer_id, "Se devolvió el pedido")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["status"], StockTransferStatus.CANCELLED)
        self.assertEqual(response.data["cancellation_reason"], "Se devolvió el pedido")
        self.assertEqual(current_stock(self.nozzle), 10)
        self.assertEqual(current_stock(self.valve), 3)

        reversals = StockMovement.objects.filter(movement_type=StockMovementType.REVERSAL)

        self.assertEqual(reversals.count(), 2)
        self.assertTrue(all(m.stock_transfer_item_id is not None for m in reversals))
        self.assertEqual(self._cancel(transfer_id, "Otra vez").status_code, status.HTTP_400_BAD_REQUEST)

    def test_cancel_draft_only_changes_the_status(self):
        transfer_id = self._create_transfer([(self.nozzle, 4)])

        response = self._cancel(transfer_id)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["status"], StockTransferStatus.CANCELLED)
        self.assertFalse(StockMovement.objects.exclude(movement_type=StockMovementType.INITIAL).exists())

    def test_confirmed_transfer_cannot_be_edited(self):
        transfer_id = self._create_transfer([(self.nozzle, 4)])
        self._confirm(transfer_id)
        item_id = StockTransfer.objects.get(pk=transfer_id).items.get().id

        responses = [
            self.client.patch(f"{self.transfers_url}{transfer_id}/", {"notes": "x"}, format="json"),
            self.client.delete(f"{self.transfers_url}{transfer_id}/"),
            self.client.post(
                self.items_url,
                {"stock_transfer": transfer_id, "product": self.valve.id, "quantity": 1},
                format="json",
            ),
            self.client.patch(f"{self.items_url}{item_id}/", {"quantity": 1}, format="json"),
            self.client.delete(f"{self.items_url}{item_id}/"),
        ]

        for response in responses:
            with self.subTest(url=response.request["PATH_INFO"], method=response.request["REQUEST_METHOD"]):
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_draft_lines_can_change_quantity_and_be_removed(self):
        transfer_id = self._create_transfer([(self.nozzle, 4), (self.valve, 1)])
        transfer = StockTransfer.objects.get(pk=transfer_id)
        nozzle_item = transfer.items.get(product=self.nozzle)

        self.assertEqual(
            self.client.patch(f"{self.items_url}{nozzle_item.id}/", {"quantity": 2}, format="json").status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.delete(f"{self.items_url}{transfer.items.get(product=self.valve).id}/").status_code,
            status.HTTP_204_NO_CONTENT,
        )

        response = self.client.get(f"{self.transfers_url}{transfer_id}/")

        self.assertEqual([item["quantity"] for item in response.data["items"]], [2])

    def test_same_product_twice_is_rejected(self):
        transfer_id = self._create_transfer([(self.nozzle, 1)])

        response = self.client.post(
            self.items_url,
            {"stock_transfer": transfer_id, "product": self.nozzle.id, "quantity": 2},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("product", response.data)

    def test_draft_can_be_deleted(self):
        transfer_id = self._create_transfer([(self.nozzle, 1)])

        response = self.client.delete(f"{self.transfers_url}{transfer_id}/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(StockTransfer.objects.filter(pk=transfer_id).exists())

    def test_movements_show_the_transfer_as_origin(self):
        from apps.inventory.views.stock_movement import movement_origin_label

        transfer_id = self._create_transfer([(self.nozzle, 4)])
        self._confirm(transfer_id)

        response = self.client.get(
            "/api/inventory/stock-movements/",
            {"stock_transfer": transfer_id},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["stock_transfer_id"], transfer_id)
        self.assertEqual(response.data["results"][0]["movement_type_display"], "Traslado a sede")

        movement = StockMovement.objects.get(movement_type=StockMovementType.TRANSFER_OUT)

        self.assertEqual(movement_origin_label(movement), f"Traslado #{transfer_id}")

    def test_most_moved_products_does_not_count_transfers(self):
        transfer_id = self._create_transfer([(self.nozzle, 4)])
        self._confirm(transfer_id)

        results = most_moved_products_results(None, None)

        self.assertFalse(any(row["product"]["id"] == self.nozzle.id for row in results))

    def test_guide_pdf(self):
        from reportlab import rl_config

        transfer_id = self._create_transfer([(self.nozzle, 4)])
        self._confirm(transfer_id)

        # Sin comprimir, para leer el texto del PDF.
        with mock.patch.object(rl_config, "pageCompression", 0):
            response = self.client.get(f"{self.transfers_url}{transfer_id}/guide/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn(f"guia-traslado-{transfer_id}.pdf", response["Content-Disposition"])

        text = b"".join(response.streaming_content).decode("latin-1")

        self.assertIn("Otra sede", text)
        self.assertIn("TOB-1", text)

    def test_list_filters_by_status_and_product(self):
        confirmed_id = self._create_transfer([(self.nozzle, 1)])
        self._confirm(confirmed_id)
        draft_id = self._create_transfer([(self.valve, 1)])

        by_status = self.client.get(self.transfers_url, {"status": "draft"})
        by_product = self.client.get(self.transfers_url, {"q": "TOB"})
        by_number = self.client.get(self.transfers_url, {"q": str(draft_id)})

        self.assertEqual([t["id"] for t in by_status.data["results"]], [draft_id])
        self.assertEqual([t["id"] for t in by_product.data["results"]], [confirmed_id])
        self.assertEqual([t["id"] for t in by_number.data["results"]], [draft_id])
        self.assertEqual(
            self.client.get(self.transfers_url, {"status": "nope"}).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_branches_are_created_from_the_transfer_and_names_do_not_repeat(self):
        response = self.client.post("/api/inventory/branches/", {"name": "  Sede   Norte "}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["name"], "Sede Norte")

        duplicate = self.client.post("/api/inventory/branches/", {"name": "sede norte"}, format="json")

        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", duplicate.data)
        self.assertEqual(
            self.client.delete(f"/api/inventory/branches/{response.data['id']}/").status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def test_only_the_administrator(self):
        for role in (ROLE_INVENTORY, ROLE_READ_ONLY):
            with self.subTest(role=role):
                user = User.objects.create_user(username=f"no-{role}", password="12345678")
                user.groups.add(Group.objects.get(name=role))
                self.client.force_authenticate(user)

                for url in (self.transfers_url, self.items_url, "/api/inventory/branches/"):
                    self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)

    def test_transfer_out_needs_a_transfer_line(self):
        from django.core.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            StockMovement.create_from_service(
                product=self.nozzle,
                movement_type=StockMovementType.TRANSFER_OUT,
                direction=MovementDirection.OUT,
                quantity=1,
                created_by=self.user,
                updated_by=self.user,
            )

    def test_transfer_date_is_required(self):
        response = self.client.post(self.transfers_url, {"branch": self.branch.id}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("transfer_date", response.data)

    def test_default_branch_exists(self):
        self.assertTrue(Branch.objects.filter(name="Otra sede", is_active=True).exists())
