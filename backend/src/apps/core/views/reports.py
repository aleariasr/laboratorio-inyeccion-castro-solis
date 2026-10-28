from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Count, Q, Sum
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.pagination import StandardResultsSetPagination
from apps.core.permissions import ReportsPermission
from apps.core.query_params import (
    parse_date_or_none,
    parse_positive_integer_query_param,
)
from apps.inventory.models import (
    Currency,
    MovementDirection,
    Product,
    Purchase,
    PurchaseItem,
    PurchaseStatus,
    StockMovement,
    StockMovementType,
)
from apps.inventory.selectors import (
    current_stock_bulk,
    low_stock_products,
    stock_history,
)
from apps.sales.models import SaleItem
from apps.sales.selectors import confirmed_sales, sale_amounts


# Puntos 2 + 27: cada reporte arma sus datos en una función que usan la
# respuesta JSON (paginada) y el PDF (completo, ver report_pdfs.py), para
# que los dos muestren exactamente lo mismo.


def low_stock_report_products():
    return (
        low_stock_products()
        .select_related("storage_location")
    )


class LowStockProductsReportView(APIView):
    permission_classes = [ReportsPermission]
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        queryset = low_stock_report_products()

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


def stock_by_location_filters(request):
    location_id = parse_positive_integer_query_param(
        request.query_params.get("location"),
        name="location",
    )

    query = request.query_params.get("q", "").strip()

    return location_id, query


def stock_by_location_results(location_id, query):
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
            | Q(own_code__icontains=query)
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

    return sorted(
        locations.values(),
        key=lambda item: item["code"],
    )


class StockByLocationReportView(APIView):
    permission_classes = [ReportsPermission]
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        location_id, query = stock_by_location_filters(request)

        results = stock_by_location_results(location_id, query)

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
                    "detail": "El producto es obligatorio."
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
        date_from = parse_date_or_none(date_from_value)

        if date_from is None:
            return None, None, Response(
                {
                    "detail": "date_from debe tener formato YYYY-MM-DD."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    if date_to_value:
        date_to = parse_date_or_none(date_to_value)

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


def report_product(request):
    product_id = request.query_params.get("product")

    if not product_id:
        return None, Response(
            {
                "detail": "El producto es obligatorio."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        product = Product.objects.get(
            id=product_id,
        )
    except Product.DoesNotExist:
        return None, Response(
            {
                "detail": "Producto no encontrado."
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    return product, None


def product_supplier_prices_results(product):
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

    return results


class ProductSupplierPricesReportView(APIView):
    permission_classes = [ReportsPermission]
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        product, error_response = report_product(request)

        if error_response is not None:
            return error_response

        results = product_supplier_prices_results(product)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(results, request, view=self)

        response = paginator.get_paginated_response(page)
        response.data["product"] = {
            "id": product.id,
            "standard_code": product.standard_code,
            "name": product.name,
        }

        return response


def purchases_by_supplier_results(date_from, date_to):
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

    return results


class PurchasesBySupplierReportView(APIView):
    permission_classes = [ReportsPermission]
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        date_from, date_to, error_response = parse_report_dates(request)

        if error_response is not None:
            return error_response

        results = purchases_by_supplier_results(date_from, date_to)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(results, request, view=self)

        response = paginator.get_paginated_response(page)
        response.data["date_from"] = date_from
        response.data["date_to"] = date_to

        return response


def top_selling_products_results(date_from, date_to):
    # Mismas ventas que la caja: confirmadas y activas (punto 20).
    sale_items = SaleItem.objects.select_related(
        "sale",
        "product",
    ).filter(
        sale__in=confirmed_sales(),
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
        # Bruto: cantidad × precio de la línea, antes del descuento y
        # el impuesto, que son del documento y no de un producto
        # (decisión del punto 19). El frontend lo rotula así.
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

    return results


class TopSellingProductsReportView(APIView):
    permission_classes = [ReportsPermission]
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        date_from, date_to, error_response = parse_report_dates(request)

        if error_response is not None:
            return error_response

        results = top_selling_products_results(date_from, date_to)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(results, request, view=self)

        response = paginator.get_paginated_response(page)
        response.data["date_from"] = date_from
        response.data["date_to"] = date_to

        return response


def parse_top_customers_ordering(request):
    return parse_report_ordering(
        request,
        allowed_values={"total", "sale_count"},
        default="total",
    )


def top_customers_results(date_from, date_to, ordering):
    # Mismas ventas que la caja: confirmadas y activas (punto 20).
    sales = confirmed_sales().select_related(
        "customer",
    ).filter(
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

        # Lo cobrado: con descuento e impuesto (punto 19).
        total = sale_amounts(sale).total

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

    return results


class TopCustomersReportView(APIView):
    permission_classes = [ReportsPermission]
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        date_from, date_to, error_response = parse_report_dates(request)

        if error_response is not None:
            return error_response

        ordering, ordering_error_response = parse_top_customers_ordering(
            request,
        )

        if ordering_error_response is not None:
            return ordering_error_response

        results = top_customers_results(date_from, date_to, ordering)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(results, request, view=self)

        response = paginator.get_paginated_response(page)
        response.data["date_from"] = date_from
        response.data["date_to"] = date_to
        response.data["ordering"] = ordering

        return response


def most_moved_products_results(date_from, date_to):
    """
    Productos que más se mueven (punto 28): entradas, salidas, total
    movido (entradas + salidas) y cantidad de movimientos por producto,
    de mayor a menor total.

    Neto de reversiones: un movimiento revertido (una venta anulada, por
    ejemplo) no cuenta, y la reversión tampoco. El inventario inicial
    queda fuera: es la carga de existencias, no un movimiento del
    negocio. Ajustes y conteos sí cuentan. Los traslados a otra sede
    (punto 6 del plan del 2026-10-22) tampoco: mueven mercadería entre
    sedes, no son rotación del negocio.
    """

    movements = StockMovement.objects.exclude(
        movement_type__in=(
            StockMovementType.INITIAL,
            StockMovementType.REVERSAL,
            StockMovementType.TRANSFER_OUT,
        ),
    ).filter(
        reversal_movement__isnull=True,
    )

    if date_from:
        movements = movements.filter(created_at__date__gte=date_from)

    if date_to:
        movements = movements.filter(created_at__date__lte=date_to)

    grouped = (
        movements
        # Sin el orden del modelo: si no, entra en el GROUP BY.
        .order_by()
        .values(
            "product_id",
            "product__standard_code",
            "product__name",
            "product__storage_location__code",
        )
        .annotate(
            quantity_in=Sum(
                "quantity",
                filter=Q(direction=MovementDirection.IN),
                default=0,
            ),
            quantity_out=Sum(
                "quantity",
                filter=Q(direction=MovementDirection.OUT),
                default=0,
            ),
            movement_count=Count("id"),
        )
    )

    results = [
        {
            "product": {
                "id": row["product_id"],
                "standard_code": row["product__standard_code"],
                "name": row["product__name"],
            },
            "location_code": row["product__storage_location__code"],
            "quantity_in": row["quantity_in"],
            "quantity_out": row["quantity_out"],
            "total_moved": row["quantity_in"] + row["quantity_out"],
            "movement_count": row["movement_count"],
        }
        for row in grouped
    ]

    results.sort(
        key=lambda item: (
            -item["total_moved"],
            item["product"]["standard_code"],
        ),
    )

    return results


class MostMovedProductsReportView(APIView):
    permission_classes = [ReportsPermission]
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        date_from, date_to, error_response = parse_report_dates(request)

        if error_response is not None:
            return error_response

        results = most_moved_products_results(date_from, date_to)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(results, request, view=self)

        response = paginator.get_paginated_response(page)
        response.data["date_from"] = date_from
        response.data["date_to"] = date_to

        return response
