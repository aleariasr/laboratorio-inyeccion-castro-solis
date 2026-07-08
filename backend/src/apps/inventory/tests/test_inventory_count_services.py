from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.inventory.models import (
    InventoryCount,
    InventoryCountStatus,
)
from apps.inventory.services import approve_inventory_count

User = get_user_model()


class InventoryCountServiceTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="tester",
            password="12345678",
        )

        self.inventory_count = InventoryCount.objects.create(
            reference="INV-0001",
            count_date=date.today(),
            created_by=self.user,
            updated_by=self.user,
        )

    def test_approve_inventory_count(self):
        approve_inventory_count(
            inventory_count=self.inventory_count,
            user=self.user,
        )

        self.inventory_count.refresh_from_db()

        self.assertEqual(
            self.inventory_count.status,
            InventoryCountStatus.APPROVED,
        )

    def test_cannot_approve_twice(self):
        approve_inventory_count(
            inventory_count=self.inventory_count,
            user=self.user,
        )

        with self.assertRaises(ValueError):
            approve_inventory_count(
                inventory_count=self.inventory_count,
                user=self.user,
            )