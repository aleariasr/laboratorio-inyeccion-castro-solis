from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import InventoryPermission
from apps.customers.models import Customer, Injector
from apps.inventory.models import (
    Product,
    ProductReference,
    Purchase,
    StorageLocation,
    Supplier,
)
from apps.inventory.selectors import (
    current_stock_bulk,
    low_stock_products,
    stock_history,
)


class UniversalSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = request.query_params.get("q", "").strip()

        if len(query) < 2:
            return Response(
                {
                    "query": query,
                    "results": {
                        "products": [],
                        "locations": [],
                        "product_references": [],
                        "suppliers": [],
                        "purchases": [],
                        "customers": [],
                        "injectors": [],
                    },
                }
            )

        return Response(
            {
                "query": query,
                "results": {
                    "products": self.search_products(query),
                    "locations": self.search_locations(query),
                    "product_references": self.search_product_references(query),
                    "suppliers": self.search_suppliers(query),
                    "purchases": self.search_purchases(query),
                    "customers": self.search_customers(query),
                    "injectors": self.search_injectors(query),
                },
            }
        )

    def search_products(self, query):
        products = (
            Product.objects
            .select_related("storage_location")
            .filter(
                standard_code__icontains=query,
            )[:10]
        )

        return [
            {
                "id": product.id,
                "standard_code": product.standard_code,
                "name": product.name,
                "description": product.description,
                "storage_location": {
                    "id": product.storage_location_id,
                    "code": product.storage_location.code,
                } if product.storage_location_id else None,
            }
            for product in products
        ]

    def search_locations(self, query):
        locations = (
            StorageLocation.objects
            .filter(
                code__icontains=query,
            )
            .order_by("code")[:10]
        )

        return [
            {
                "id": location.id,
                "code": location.code,
                "description": location.description,
            }
            for location in locations
        ]

    def search_product_references(self, query):
        references = (
            ProductReference.objects
            .select_related("product")
            .filter(
                reference_code__icontains=query,
            )
            .order_by("reference_code")[:10]
        )

        return [
            {
                "id": reference.id,
                "reference_code": reference.reference_code,
                "manufacturer": reference.manufacturer,
                "product": {
                    "id": reference.product_id,
                    "standard_code": reference.product.standard_code,
                    "name": reference.product.name,
                },
            }
            for reference in references
        ]

    def search_suppliers(self, query):
        suppliers = (
            Supplier.objects
            .filter(
                name__icontains=query,
            )
            .order_by("name")[:10]
        )

        return [
            {
                "id": supplier.id,
                "name": supplier.name,
                "phone": supplier.phone,
                "email": supplier.email,
                "country": supplier.country,
            }
            for supplier in suppliers
        ]

    def search_purchases(self, query):
        purchases = (
            Purchase.objects
            .select_related("supplier")
            .filter(
                invoice_number__icontains=query,
            )
            .order_by("-purchase_date", "-id")[:10]
        )

        return [
            {
                "id": purchase.id,
                "invoice_number": purchase.invoice_number,
                "purchase_date": purchase.purchase_date,
                "supplier": {
                    "id": purchase.supplier_id,
                    "name": purchase.supplier.name,
                },
                "status": purchase.status,
            }
            for purchase in purchases
        ]

    def search_customers(self, query):
        customers = (
            Customer.objects
            .filter(
                display_name__icontains=query,
            )
            .order_by("display_name")[:10]
        )

        return [
            {
                "id": customer.id,
                "display_name": customer.display_name,
                "phone": customer.phone,
                "email": customer.email,
                "identification": customer.identification,
            }
            for customer in customers
        ]

    def search_injectors(self, query):
        injectors = (
            Injector.objects
            .select_related("customer")
            .filter(
                injector_number__icontains=query,
            )
            .order_by("injector_number")[:10]
        )

        return [
            {
                "id": injector.id,
                "injector_number": injector.injector_number,
                "description": injector.description,
                "customer": {
                    "id": injector.customer_id,
                    "display_name": injector.customer.display_name,
                },
            }
            for injector in injectors
        ]
    
class LowStockProductsReportView(APIView):
    permission_classes = [InventoryPermission]

    def get(self, request):
        products = (
            low_stock_products()
            .select_related("storage_location")[:100]
        )

        return Response(
            {
                "results": [
                    {
                        "id": product.id,
                        "standard_code": product.standard_code,
                        "name": product.name,
                        "minimum_stock": product.minimum_stock,
                        "current_stock": product.current_stock,
                        "storage_location": {
                            "id": product.storage_location_id,
                            "code": product.storage_location.code,
                        },
                    }
                    for product in products
                ]
            }
        )


class StockByLocationReportView(APIView):
    permission_classes = [InventoryPermission]

    def get(self, request):
        products = (
            current_stock_bulk()
            .select_related("storage_location")
        )

        locations = {}

        for product in products:
            location = product.storage_location

            if location.id not in locations:
                locations[location.id] = {
                    "id": location.id,
                    "code": location.code,
                    "description": location.description,
                    "total_stock": 0,
                    "products": [],
                }

            locations[location.id]["total_stock"] += product.current_stock
            locations[location.id]["products"].append(
                {
                    "id": product.id,
                    "standard_code": product.standard_code,
                    "name": product.name,
                    "current_stock": product.current_stock,
                    "minimum_stock": product.minimum_stock,
                }
            )

        return Response(
            {
                "results": list(
                    sorted(
                        locations.values(),
                        key=lambda item: item["code"],
                    )
                )
            }
        )


class ProductMovementsReportView(APIView):
    permission_classes = [InventoryPermission]

    def get(self, request):
        product_id = request.query_params.get("product")

        if not product_id:
            return Response(
                {
                    "detail": "Debe indicar el producto."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            product = Product.objects.select_related(
                "storage_location",
            ).get(
                id=product_id,
            )
        except Product.DoesNotExist:
            return Response(
                {
                    "detail": "Producto no encontrado."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        movements = stock_history(product)[:100]

        return Response(
            {
                "product": {
                    "id": product.id,
                    "standard_code": product.standard_code,
                    "name": product.name,
                    "storage_location": {
                        "id": product.storage_location_id,
                        "code": product.storage_location.code,
                    },
                },
                "results": [
                    {
                        "id": movement.id,
                        "movement_type": movement.movement_type,
                        "direction": movement.direction,
                        "quantity": movement.quantity,
                        "purchase_item": movement.purchase_item_id,
                        "sale_item": movement.sale_item_id,
                        "notes": movement.notes,
                        "created_at": movement.created_at,
                        "created_by": movement.created_by_id,
                    }
                    for movement in movements
                ],
            }
        )