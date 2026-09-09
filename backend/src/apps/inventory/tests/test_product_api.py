from datetime import date

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_INVENTORY

from apps.inventory.models import (
    Currency,
    MovementDirection,
    Product,
    ProductCostHistory,
    Purchase,
    StockMovement,
    StockMovementType,
    StorageLocation,
    Supplier,
)

User = get_user_model()


class ProductApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="admin",
            password="12345678",
        )

        call_command("setup_roles")

        self.user.groups.add(
            Group.objects.get(name=ROLE_INVENTORY),
        )

        self.client.force_authenticate(self.user)

        self.location = StorageLocation.objects.create(
            code="A101",
            created_by=self.user,
            updated_by=self.user,
        )

        self.product = Product.objects.create(
            standard_code="P-001",
            name="Producto",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

    def test_list_products(self):
        response = self.client.get("/api/inventory/products/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_retrieve_product(self):
        response = self.client.get(
            f"/api/inventory/products/{self.product.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["standard_code"],
            "P-001",
        )

    def test_create_product(self):
        response = self.client.post(
            "/api/inventory/products/",
            {
                "standard_code": "P-002",
                "name": "Nuevo",
                "storage_location": self.location.id,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
        )

        self.assertTrue(
            Product.objects.filter(
                standard_code="P-002",
            ).exists()
        )

    def test_update_product(self):
        response = self.client.patch(
            f"/api/inventory/products/{self.product.id}/",
            {
                "name": "Producto actualizado",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.product.refresh_from_db()

        self.assertEqual(
            self.product.name,
            "Producto actualizado",
        )

    def create_additional_products(self, quantity):
        products = [
            Product(
                standard_code=f"P-{index:03d}",
                name=f"Producto {index}",
                storage_location=self.location,
                created_by=self.user,
                updated_by=self.user,
            )
            for index in range(2, quantity + 2)
        ]

        Product.objects.bulk_create(products)

    def test_product_list_has_standard_pagination_structure(self):
        response = self.client.get("/api/inventory/products/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            set(response.data.keys()),
            {"count", "next", "previous", "results"},
        )
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertIsNone(response.data["next"])
        self.assertIsNone(response.data["previous"])

    def test_product_list_uses_default_page_size(self):
        self.create_additional_products(120)

        response = self.client.get("/api/inventory/products/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 121)
        self.assertEqual(len(response.data["results"]), 50)
        self.assertIsNotNone(response.data["next"])
        self.assertIsNone(response.data["previous"])

    def test_product_list_accepts_custom_page_size(self):
        self.create_additional_products(30)

        response = self.client.get(
            "/api/inventory/products/",
            {
                "page_size": 10,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 31)
        self.assertEqual(len(response.data["results"]), 10)
        self.assertIsNotNone(response.data["next"])

    def test_product_list_limits_page_size_to_one_hundred(self):
        self.create_additional_products(120)

        response = self.client.get(
            "/api/inventory/products/",
            {
                "page_size": 500,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 121)
        self.assertEqual(len(response.data["results"]), 100)
        self.assertIsNotNone(response.data["next"])

    def test_product_list_returns_second_page(self):
        self.create_additional_products(60)

        response = self.client.get(
            "/api/inventory/products/",
            {
                "page": 2,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 61)
        self.assertEqual(len(response.data["results"]), 11)
        self.assertIsNone(response.data["next"])
        self.assertIsNotNone(response.data["previous"])


    def test_search_products_by_visible_fields(self):
        Product.objects.create(
            standard_code="INY-900",
            name="Válvula de inyector",
            description="Repuesto especial",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/inventory/products/",
            {
                "q": "inyector",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["standard_code"],
            "INY-900",
        )

    def test_filter_products_by_location_and_active_state(self):
        other_location = StorageLocation.objects.create(
            code="B202",
            created_by=self.user,
            updated_by=self.user,
        )

        inactive_product = Product.objects.create(
            standard_code="P-900",
            name="Producto inactivo",
            storage_location=other_location,
            is_active=False,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/inventory/products/",
            {
                "storage_location": other_location.id,
                "is_active": "false",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["id"],
            inactive_product.id,
        )

    def test_invalid_product_location_filter_returns_400(self):
        response = self.client.get(
            "/api/inventory/products/",
            {
                "storage_location": "invalid",
            },
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn("storage_location", response.data)

    def test_product_list_returns_calculated_current_stock(self):
        StockMovement.create_from_service(
            product=self.product,
            movement_type=StockMovementType.INITIAL,
            direction=MovementDirection.IN,
            quantity=12,
            notes="Inventario inicial de prueba.",
            created_by=self.user,
            updated_by=self.user,
        )

        StockMovement.create_from_service(
            product=self.product,
            movement_type=StockMovementType.ADJUSTMENT,
            direction=MovementDirection.OUT,
            quantity=4,
            notes="Ajuste negativo de prueba.",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get("/api/inventory/products/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["results"][0]["current_stock"],
            8,
        )

    def test_product_detail_returns_calculated_current_stock(self):
        StockMovement.create_from_service(
            product=self.product,
            movement_type=StockMovementType.INITIAL,
            direction=MovementDirection.IN,
            quantity=7,
            notes="Inventario inicial de prueba.",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            f"/api/inventory/products/{self.product.id}/"
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["current_stock"],
            7,
        )

    def test_product_list_does_not_query_stock_per_product(self):
        self.create_additional_products(20)

        # 5 queries fijas sin importar cuántos productos haya: 2 son
        # de ModulePermission poblando la caché de permisos del
        # usuario (grupo ADMIN + permisos directos/de grupo vía
        # has_perm), 1 es el COUNT de paginación y 2 son el SELECT de
        # productos con su stock. Lo que valida este test es que no
        # crezcan con la cantidad de productos (no hay N+1).
        with self.assertNumQueries(5):
            response = self.client.get(
                "/api/inventory/products/",
            )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["count"],
            21,
        )
        self.assertEqual(
            len(response.data["results"]),
            21,
        )

    def test_create_product_normalizes_text_values_and_sets_audit_users(self):
        response = self.client.post(
            "/api/inventory/products/",
            {
                "standard_code": "  iny-001  ",
                "name": "  Válvula de inyector  ",
                "description": "  Repuesto de prueba  ",
                "storage_location": self.location.id,
                "minimum_stock": 3,
                "unit_of_measure": "  Unidad  ",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
        )

        product = Product.objects.get(
            id=response.data["id"],
        )

        self.assertEqual(
            product.standard_code,
            "INY-001",
        )
        self.assertEqual(
            product.name,
            "Válvula de inyector",
        )
        self.assertEqual(
            product.description,
            "Repuesto de prueba",
        )
        self.assertEqual(
            product.unit_of_measure,
            "unidad",
        )
        self.assertEqual(
            product.created_by,
            self.user,
        )
        self.assertEqual(
            product.updated_by,
            self.user,
        )

    def test_duplicate_normalized_product_code_returns_400(self):
        response = self.client.post(
            "/api/inventory/products/",
            {
                "standard_code": "  p-001  ",
                "name": "Duplicado",
                "storage_location": self.location.id,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn(
            "standard_code",
            response.data,
        )

    def test_create_product_in_inactive_location_returns_400(self):
        inactive_location = StorageLocation.objects.create(
            code="B202",
            is_active=False,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.post(
            "/api/inventory/products/",
            {
                "standard_code": "P-900",
                "name": "Producto inválido",
                "storage_location": inactive_location.id,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn(
            "storage_location",
            response.data,
        )

    def test_move_product_to_inactive_location_returns_400(self):
        inactive_location = StorageLocation.objects.create(
            code="B202",
            is_active=False,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.patch(
            f"/api/inventory/products/{self.product.id}/",
            {
                "storage_location": inactive_location.id,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn(
            "storage_location",
            response.data,
        )

        self.product.refresh_from_db()

        self.assertEqual(
            self.product.storage_location,
            self.location,
        )

    def test_update_other_fields_when_current_location_is_inactive(self):
        self.location.is_active = False
        self.location.save(
            update_fields=[
                "is_active",
                "updated_at",
            ],
        )

        response = self.client.patch(
            f"/api/inventory/products/{self.product.id}/",
            {
                "name": "  Producto actualizado  ",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.product.refresh_from_db()

        self.assertEqual(
            self.product.name,
            "Producto actualizado",
        )
        self.assertEqual(
            self.product.storage_location,
            self.location,
        )

    def test_cannot_reactivate_product_in_inactive_location(self):
        inactive_location = StorageLocation.objects.create(
            code="Z999",
            description="Ubicación inactiva",
            is_active=False,
            created_by=self.user,
            updated_by=self.user,
        )

        product = Product.objects.create(
            standard_code="REACTIVATE-001",
            name="Producto por reactivar",
            storage_location=inactive_location,
            minimum_stock=0,
            unit_of_measure="unidad",
            is_active=False,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.patch(
            f"/api/inventory/products/{product.id}/",
            {
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn(
            "storage_location",
            response.data,
        )

        product.refresh_from_db()

        self.assertFalse(product.is_active)

    def test_current_stock_cannot_be_modified_through_product_api(self):
        response = self.client.patch(
            f"/api/inventory/products/{self.product.id}/",
            {
                "current_stock": 999,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        detail_response = self.client.get(
            f"/api/inventory/products/{self.product.id}/"
        )

        self.assertEqual(
            detail_response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            detail_response.data["current_stock"],
            0,
        )

    def test_delete_product_is_not_allowed(self):
        response = self.client.delete(
            f"/api/inventory/products/{self.product.id}/"
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertTrue(
            Product.objects.filter(
                id=self.product.id,
            ).exists()
        )

    def create_cost_history(self, suggested_price, currency=Currency.CRC, exchange_rate="1.0000"):
        supplier = Supplier.objects.create(
            name=f"Proveedor prueba {ProductCostHistory.objects.count() + 1}",
            created_by=self.user,
            updated_by=self.user,
        )

        purchase = Purchase.objects.create(
            supplier=supplier,
            invoice_number=f"FAC-{ProductCostHistory.objects.count() + 1:03d}",
            purchase_date=date.today(),
            currency=currency,
            exchange_rate=exchange_rate,
            created_by=self.user,
            updated_by=self.user,
        )

        return ProductCostHistory.objects.create(
            product=self.product,
            purchase=purchase,
            original_unit_cost="100.0000",
            cost_factor="1.200000",
            final_unit_cost="120.0000",
            currency=currency,
            exchange_rate=exchange_rate,
            margin_percentage="30.0000",
            suggested_price=suggested_price,
            created_by=self.user,
            updated_by=self.user,
        )

    def test_effective_sale_price_is_null_without_custom_price_or_history(self):
        response = self.client.get(
            f"/api/inventory/products/{self.product.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["custom_sale_price"])
        self.assertIsNone(response.data["latest_suggested_price"])
        self.assertIsNone(response.data["effective_sale_price"])

    def test_effective_sale_price_uses_latest_suggested_price_when_no_custom_price(self):
        self.create_cost_history("100.0000")
        self.create_cost_history("156.0000")

        response = self.client.get(
            f"/api/inventory/products/{self.product.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["custom_sale_price"])
        self.assertEqual(
            response.data["latest_suggested_price"],
            "156.0000",
        )
        self.assertEqual(
            response.data["effective_sale_price"],
            "156.0000",
        )

    def test_effective_sale_price_converts_usd_suggested_price_to_crc(self):
        self.create_cost_history(
            "10.0000",
            currency=Currency.USD,
            exchange_rate="520.0000",
        )

        response = self.client.get(
            f"/api/inventory/products/{self.product.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["latest_suggested_price"],
            "5200.0000",
        )
        self.assertEqual(
            response.data["effective_sale_price"],
            "5200.0000",
        )

    def test_effective_sale_price_prefers_custom_sale_price_over_suggested(self):
        self.create_cost_history("156.0000")

        self.product.custom_sale_price = "200.0000"
        self.product.save(update_fields=["custom_sale_price"])

        response = self.client.get(
            f"/api/inventory/products/{self.product.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["custom_sale_price"],
            "200.0000",
        )
        self.assertEqual(
            response.data["latest_suggested_price"],
            "156.0000",
        )
        self.assertEqual(
            response.data["effective_sale_price"],
            "200.0000",
        )

    def test_product_list_includes_effective_sale_price(self):
        self.create_cost_history("156.0000")

        response = self.client.get("/api/inventory/products/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = response.data["results"][0]
        self.assertEqual(item["effective_sale_price"], "156.0000")

    def test_update_custom_sale_price(self):
        response = self.client.patch(
            f"/api/inventory/products/{self.product.id}/",
            {
                "custom_sale_price": "199.9900",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.product.refresh_from_db()
        self.assertEqual(
            str(self.product.custom_sale_price),
            "199.9900",
        )

    def test_custom_sale_price_must_be_positive(self):
        response = self.client.patch(
            f"/api/inventory/products/{self.product.id}/",
            {
                "custom_sale_price": "0",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_custom_sale_price_can_be_cleared(self):
        self.product.custom_sale_price = "200.0000"
        self.product.save(update_fields=["custom_sale_price"])

        response = self.client.patch(
            f"/api/inventory/products/{self.product.id}/",
            {
                "custom_sale_price": None,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.product.refresh_from_db()
        self.assertIsNone(self.product.custom_sale_price)

    def test_add_variant_shares_standard_code_and_storage_location(self):
        response = self.client.post(
            f"/api/inventory/products/{self.product.id}/add-variant/",
            {
                "name": "Producto (genérico)",
                "variant_kind": "GENERIC",
                "custom_sale_price": "5000.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        variant = Product.objects.get(id=response.data["id"])

        self.assertEqual(variant.standard_code, self.product.standard_code)
        self.assertEqual(variant.storage_location, self.location)
        self.assertEqual(variant.variant_kind, "GENERIC")
        self.assertEqual(str(variant.custom_sale_price), "5000.0000")
        self.assertNotEqual(variant.id, self.product.id)

    def test_add_variant_defaults_unit_of_measure_from_parent(self):
        self.product.unit_of_measure = "juego"
        self.product.save(update_fields=["unit_of_measure"])

        response = self.client.post(
            f"/api/inventory/products/{self.product.id}/add-variant/",
            {
                "name": "Variante sin unidad explícita",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["unit_of_measure"], "juego")

    def test_add_variant_ignores_submitted_code_and_location(self):
        other_location = StorageLocation.objects.create(
            code="B202",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.post(
            f"/api/inventory/products/{self.product.id}/add-variant/",
            {
                "name": "Variante con intento de override",
                "standard_code": "OTRO-CODIGO",
                "storage_location": other_location.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            response.data["standard_code"],
            self.product.standard_code,
        )
        self.assertEqual(
            response.data["storage_location"],
            self.location.id,
        )

    def test_products_can_share_standard_code(self):
        response = self.client.post(
            "/api/inventory/products/",
            {
                "standard_code": self.product.standard_code,
                "name": "Segunda fila, mismo código",
                "storage_location": self.location.id,
            },
            format="json",
        )

        # El formulario normal de creación sigue rechazando códigos
        # duplicados a propósito (solo add-variant puede crearlos) —
        # ver §3.6: solo verifica que el modelo en sí ya lo permite.
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        Product.objects.create(
            standard_code=self.product.standard_code,
            name="Segunda fila, mismo código",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

        self.assertEqual(
            Product.objects.filter(
                standard_code=self.product.standard_code,
            ).count(),
            2,
        )

    def test_filter_products_by_exact_standard_code(self):
        Product.objects.create(
            standard_code=self.product.standard_code,
            name="Variante hermana",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

        Product.objects.create(
            standard_code=f"{self.product.standard_code}-X",
            name="Código parecido pero distinto",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/inventory/products/",
            {
                "standard_code": self.product.standard_code,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

    def test_cannot_move_variant_with_siblings_to_different_location(self):
        other_location = StorageLocation.objects.create(
            code="B202",
            created_by=self.user,
            updated_by=self.user,
        )

        sibling = Product.objects.create(
            standard_code=self.product.standard_code,
            name="Variante hermana",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.patch(
            f"/api/inventory/products/{sibling.id}/",
            {
                "storage_location": other_location.id,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn("storage_location", response.data)

    def test_can_move_lone_product_to_different_location(self):
        other_location = StorageLocation.objects.create(
            code="B202",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.patch(
            f"/api/inventory/products/{self.product.id}/",
            {
                "storage_location": other_location.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
