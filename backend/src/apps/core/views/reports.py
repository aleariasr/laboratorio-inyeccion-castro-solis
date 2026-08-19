from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Q
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.pagination import StandardResultsSetPagination
from apps.core.permissions import ReportsPermission
from apps.core.query_params import parse_positive_integer_query_param
from apps.inventory.models import (
    Currency,
    Product,
    Purchase,
    PurchaseItem,
    PurchaseStatus,
)
from apps.inventory.selectors import (
    current_stock_bulk,
    low_stock_products,
    stock_history,
)
from apps.sales.models import Sale, SaleItem, SaleStatus


class LowStockProductsReportView(APIView):
    permission_classes = [ReportsPermission]
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        queryset = (
            low_stock_products()
            .select_related("storage_location")
        )

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)

        results = [
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
            for product in page
        ]

        return paginator.get_paginated_response(results)


class StockByLocationReportView(APIView):
    permission_classes = [ReportsPermission]
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        location_id = parse_positive_integer_query_param(
            request.query_params.get("location"),
            name="location",
        )

        query = request.query_params.get("q", "").strip()

        products = (
            current_stock_bulk()
            .select_related("storage_location")
        )

        if location_id is not None:
            products = products.filter(
                storage_location_id=location_id,
            )

        if query:
            products = products.filter(
                Q(standard_code__icontains=query)
                | Q(name__icontains=query)
                | Q(description__icontains=query)
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

        results = sorted(
            locations.values(),
            key=lambda item: item["code"],
        )

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(results, request, view=self)

        response = paginator.get_paginated_response(page)
        response.data["location"] = location_id
        response.data["q"] = query or None

        return response


class ProductMovementsReportView(APIView):
    permission_classes = [ReportsPermission]

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


def parse_report_dates(request):
    date_from_value = request.query_params.get("date_from")
    date_to_value = request.query_params.get("date_to")

    date_from = None
    date_to = None

    if date_from_value:
        date_from = parse_date(date_from_value)

        if date_from is None:
            return None, None, Response(
                {
                    "detail": "date_from debe tener formato YYYY-MM-DD."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    if date_to_value:
        date_to = parse_date(date_to_value)

        if date_to is None:
            return None, None, Response(
                {
                    "detail": "date_to debe tener formato YYYY-MM-DD."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    if date_from and date_to and date_from > date_to:
        return None, None, Response(
            {
                "detail": "date_from no puede ser mayor que date_to."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    return date_from, date_to, None


def parse_report_ordering(request, *, allowed_values, default):
    """
    Valida el parámetro opcional `ordering` contra una lista blanca.

    Devuelve (valor, respuesta_de_error). Si `ordering` no viene en la
    solicitud, devuelve `default`. Si viene pero no es uno de los
    valores permitidos, devuelve un 400 explícito en vez de aplicar un
    orden arbitrario o ignorar el parámetro en silencio.
    """

    value = request.query_params.get("ordering")

    if not value:
        return default, None

    if value not in allowed_values:
        return None, Response(
            {
                "detail": (
                    "ordering debe ser uno de: "
                    + ", ".join(sorted(allowed_values))
                    + "."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    return value, None


def _convert_purchase_amount_to_crc(amount, purchase):
    """
    Convierte un monto en la moneda de una compra a colones.

    El tipo de cambio de Purchase siempre se expresa como colones por
    dólar, sin importar la moneda de la compra (misma convención que
    apps.inventory.services.costs._convert_import_cost_to_purchase_currency,
    usada para los costos de importación).

    Se usa tanto para sumar subtotales de compras de un mismo proveedor
    que pueden estar en monedas distintas (reporte de compras por
    proveedor), como para comparar precios unitarios pagados a distintos
    proveedores por un mismo producto (reporte de comparación de
    precios); sin esta conversión los montos en colones y en dólares se
    mezclarían como si fueran la misma unidad.
    """

    if purchase.currency == Currency.USD:
        return amount * purchase.exchange_rate

    return amount


class ProductSupplierPricesReportView(APIView):
    permission_classes = [ReportsPermission]
    pagination_class = StandardResultsSetPagination

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
            product = Product.objects.get(
                id=product_id,
            )
        except Product.DoesNotExist:
            return Response(
                {
                    "detail": "Producto no encontrado."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        items = PurchaseItem.objects.select_related(
            "purchase__supplier",
        ).filter(
            supplier_product__product=product,
            purchase__status=PurchaseStatus.CONFIRMED,
        )

        results_by_supplier = {}

        for item in items:
            purchase = item.purchase
            supplier = purchase.supplier

            unit_cost_crc = _convert_purchase_amount_to_crc(
                item.unit_cost,
                purchase,
            ).quantize(
                Decimal("0.0001"),
                rounding=ROUND_HALF_UP,
            )

            if supplier.id not in results_by_supplier:
                results_by_supplier[supplier.id] = {
                    "supplier": {
                        "id": supplier.id,
                        "name": supplier.name,
                    },
                    "purchase_count": 0,
                    "total_unit_cost": Decimal("0"),
                    "last_purchase_date": purchase.purchase_date,
                    "last_unit_cost": unit_cost_crc,
                    "purchases": [],
                }

            entry = results_by_supplier[supplier.id]
            entry["purchase_count"] += 1
            entry["total_unit_cost"] += unit_cost_crc

            if purchase.purchase_date >= entry["last_purchase_date"]:
                entry["last_purchase_date"] = purchase.purchase_date
                entry["last_unit_cost"] = unit_cost_crc

            entry["purchases"].append(
                {
                    "id": purchase.id,
                    "invoice_number": purchase.invoice_number,
                    "purchase_date": purchase.purchase_date,
                    "unit_cost": unit_cost_crc,
                    "currency": "CRC",
                }
            )

        results = []

        for entry in results_by_supplier.values():
            average_unit_cost = (
                entry["total_unit_cost"] / entry["purchase_count"]
            ).quantize(
                Decimal("0.0001"),
                rounding=ROUND_HALF_UP,
            )

            # Historial de compras a este proveedor en orden cronológico,
            # para poder ver si el precio cambió con el tiempo (no solo
            # el último precio y el promedio).
            purchases = sorted(
                entry["purchases"],
                key=lambda purchase_entry: (
                    purchase_entry["purchase_date"],
                    purchase_entry["id"],
                ),
            )

            results.append(
                {
                    "supplier": entry["supplier"],
                    "purchase_count": entry["purchase_count"],
                    "last_purchase_date": entry["last_purchase_date"],
                    "last_unit_cost": entry["last_unit_cost"],
                    "average_unit_cost": average_unit_cost,
                    "currency": "CRC",
                    "purchases": purchases,
                }
            )

        results.sort(
            key=lambda item: (
                item["last_unit_cost"],
                item["supplier"]["name"],
            ),
        )

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(results, request, view=self)

        response = paginator.get_paginated_response(page)
        response.data["product"] = {
            "id": product.id,
            "standard_code": product.standard_code,
            "name": product.name,
        }

        return response


class PurchasesBySupplierReportView(APIView):
    permission_classes = [ReportsPermission]
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        date_from, date_to, error_response = parse_report_dates(request)

        if error_response is not None:
            return error_response

        purchases = Purchase.objects.select_related(
            "supplier",
        ).filter(
            status=PurchaseStatus.CONFIRMED,
        )

        if date_from:
            purchases = purchases.filter(
                purchase_date__gte=date_from,
            )

        if date_to:
            purchases = purchases.filter(
                purchase_date__lte=date_to,
            )

        results_by_supplier = {}

        for purchase in purchases.prefetch_related("items"):
            supplier = purchase.supplier

            if supplier.id not in results_by_supplier:
                results_by_supplier[supplier.id] = {
                    "supplier": {
                        "id": supplier.id,
                        "name": supplier.name,
                    },
                    "purchase_count": 0,
                    "invoice_subtotal": Decimal("0"),
                }

            subtotal = sum(
                (
                    item.quantity * item.unit_cost
                    for item in purchase.items.all()
                ),
                Decimal("0"),
            )

            subtotal_crc = _convert_purchase_amount_to_crc(
                subtotal,
                purchase,
            )

            results_by_supplier[supplier.id]["purchase_count"] += 1
            results_by_supplier[supplier.id]["invoice_subtotal"] += subtotal_crc

        results = sorted(
            (
                {
                    "supplier": item["supplier"],
                    "purchase_count": item["purchase_count"],
                    "invoice_subtotal": item["invoice_subtotal"],
                    "currency": "CRC",
                }
                for item in results_by_supplier.values()
            ),
            key=lambda item: item["supplier"]["name"],
        )

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(results, request, view=self)

        response = paginator.get_paginated_response(page)
        response.data["date_from"] = date_from
        response.data["date_to"] = date_to

        return response


class SalesByDateReportView(APIView):
    permission_classes = [ReportsPermission]
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        date_from, date_to, error_response = parse_report_dates(request)

        if error_response is not None:
            return error_response

        sales = Sale.objects.filter(
            status=SaleStatus.CONFIRMED,
        ).prefetch_related("items")

        if date_from:
            sales = sales.filter(
                sale_date__gte=date_from,
            )

        if date_to:
            sales = sales.filter(
                sale_date__lte=date_to,
            )

        results_by_date = {}

        for sale in sales:
            sale_date = sale.sale_date

            if sale_date not in results_by_date:
                results_by_date[sale_date] = {
                    "date": sale_date,
                    "sale_count": 0,
                    "total": Decimal("0"),
                }

            total = sum(
                (
                    item.quantity * item.unit_price
                    for item in sale.items.all()
                ),
                Decimal("0"),
            )

            results_by_date[sale_date]["sale_count"] += 1
            results_by_date[sale_date]["total"] += total

        results = sorted(
            results_by_date.values(),
            key=lambda item: item["date"],
        )

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(results, request, view=self)

        response = paginator.get_paginated_response(page)
        response.data["date_from"] = date_from
        response.data["date_to"] = date_to

        return response


class TopSellingProductsReportView(APIView):
    permission_classes = [ReportsPermission]
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        date_from, date_to, error_response = parse_report_dates(request)

        if error_response is not None:
            return error_response

        sale_items = SaleItem.objects.select_related(
            "sale",
            "product",
        ).filter(
            sale__status=SaleStatus.CONFIRMED,
        )

        if date_from:
            sale_items = sale_items.filter(
                sale__sale_date__gte=date_from,
            )

        if date_to:
            sale_items = sale_items.filter(
                sale__sale_date__lte=date_to,
            )

        results_by_product = {}

        for item in sale_items:
            product = item.product

            if product.id not in results_by_product:
                results_by_product[product.id] = {
                    "product": {
                        "id": product.id,
                        "standard_code": product.standard_code,
                        "name": product.name,
                    },
                    "quantity_sold": 0,
                    "total": Decimal("0"),
                }

            results_by_product[product.id]["quantity_sold"] += item.quantity
            results_by_product[product.id]["total"] += (
                item.quantity * item.unit_price
            )

        results = sorted(
            results_by_product.values(),
            key=lambda item: (
                -item["quantity_sold"],
                item["product"]["standard_code"],
            ),
        )

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(results, request, view=self)

        response = paginator.get_paginated_response(page)
        response.data["date_from"] = date_from
        response.data["date_to"] = date_to

        return response


class TopCustomersReportView(APIView):
    permission_classes = [ReportsPermission]
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        date_from, date_to, error_response = parse_report_dates(request)

        if error_response is not None:
            return error_response

        ordering, ordering_error_response = parse_report_ordering(
            request,
            allowed_values={"total", "sale_count"},
            default="total",
        )

        if ordering_error_response is not None:
            return ordering_error_response

        sales = Sale.objects.select_related(
            "customer",
        ).filter(
            status=SaleStatus.CONFIRMED,
            customer__isnull=False,
        ).prefetch_related("items")

        if date_from:
            sales = sales.filter(
                sale_date__gte=date_from,
            )

        if date_to:
            sales = sales.filter(
                sale_date__lte=date_to,
            )

        results_by_customer = {}

        for sale in sales:
            customer = sale.customer

            if customer.id not in results_by_customer:
                results_by_customer[customer.id] = {
                    "customer": {
                        "id": customer.id,
                        "display_name": customer.display_name,
                    },
                    "sale_count": 0,
                    "total": Decimal("0"),
                }

            total = sum(
                (
                    item.quantity * item.unit_price
                    for item in sale.items.all()
                ),
                Decimal("0"),
            )

            results_by_customer[customer.id]["sale_count"] += 1
            results_by_customer[customer.id]["total"] += total

        if ordering == "sale_count":
            sort_key = lambda item: (
                -item["sale_count"],
                item["customer"]["display_name"],
            )
        else:
            sort_key = lambda item: (
                -item["total"],
                item["customer"]["display_name"],
            )

        results = sorted(
            results_by_customer.values(),
            key=sort_key,
        )

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(results, request, view=self)

        response = paginator.get_paginated_response(page)
        response.data["date_from"] = date_from
        response.data["date_to"] = date_to
        response.data["ordering"] = ordering

        return response
