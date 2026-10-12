"""
PDF de cada reporte (puntos 2 + 27): ruta hermana `.../pdf/` de la
consulta JSON, con los mismos filtros, el mismo permiso y los mismos
datos (las funciones de reports.py y sales_summary.py), pero sin
paginar. Movimientos y el cierre de caja tienen su PDF en su propia
vista.
"""

from django.utils import timezone
from rest_framework.views import APIView

from apps.core.models import PaymentMethod
from apps.core.permissions import ReportsPermission
from apps.documents.report_pdf import (
    Column,
    GroupRow,
    Table,
    build_report_pdf,
    format_amount,
    format_date,
    format_date_range,
    report_pdf_response,
)
from apps.inventory.models import StorageLocation

from .reports import (
    low_stock_report_products,
    parse_report_dates,
    parse_top_customers_ordering,
    product_supplier_prices_results,
    purchases_by_supplier_results,
    report_product,
    stock_by_location_filters,
    stock_by_location_results,
    top_customers_results,
    top_selling_products_results,
)
from .sales_summary import (
    COMPARED_FIELDS,
    parse_sales_summary_params,
    sales_summary_data,
)

AMOUNTS_IN_CRC = "Montos en colones."


def _file_date():
    return timezone.localdate().isoformat()


class LowStockProductsReportPdfView(APIView):
    permission_classes = [ReportsPermission]

    def get(self, request):
        products = list(low_stock_report_products())

        rows = [
            (
                product.standard_code,
                product.name,
                product.storage_location.code,
                str(product.minimum_stock),
                str(product.current_stock),
                "",
            )
            for product in products
        ]

        buffer = build_report_pdf(
            title="Bajo mínimo",
            subtitle_lines=[
                "Productos con existencia en o por debajo del mínimo: "
                f"{len(products)}.",
                'La columna "Cantidad a pedir" queda libre para anotar.',
            ],
            blocks=[
                Table(
                    columns=(
                        Column("Código", 1.4),
                        Column("Producto", 3.1),
                        Column("Ubicación", 1.1),
                        Column("Mínimo", 0.9, align="right"),
                        Column("Existencia", 1.1, align="right"),
                        Column("Cantidad a pedir", 1.8, writable=True),
                    ),
                    rows=rows,
                    empty_message="Ningún producto está bajo el mínimo.",
                ),
            ],
        )

        return report_pdf_response(buffer, f"bajo-minimo-{_file_date()}.pdf")


class StockByLocationReportPdfView(APIView):
    permission_classes = [ReportsPermission]

    def get(self, request):
        location_id, query = stock_by_location_filters(request)

        locations = stock_by_location_results(location_id, query)

        subtitle_lines = []

        if location_id is not None:
            location = StorageLocation.objects.filter(id=location_id).first()
            subtitle_lines.append(
                f"Ubicación: {location.code if location else location_id}."
            )
        else:
            subtitle_lines.append("Todas las ubicaciones.")

        if query:
            subtitle_lines.append(f'Búsqueda: "{query}".')

        subtitle_lines.append(
            'La columna "Conteo físico" queda libre para anotar.'
        )

        rows = []

        for location in locations:
            label = location["code"]

            if location["description"]:
                label = f"{label} — {location['description']}"

            product_count = len(location["products"])

            rows.append(
                GroupRow(
                    label=label,
                    detail=(
                        f"{product_count} "
                        f"{'producto' if product_count == 1 else 'productos'}"
                        f" · existencia total {location['total_stock']}"
                    ),
                )
            )

            for product in location["products"]:
                rows.append(
                    (
                        product["standard_code"],
                        product["name"],
                        str(product["minimum_stock"]),
                        str(product["current_stock"]),
                        "",
                    )
                )

        buffer = build_report_pdf(
            title="Stock por ubicación",
            subtitle_lines=subtitle_lines,
            blocks=[
                Table(
                    columns=(
                        Column("Código", 1.4),
                        Column("Producto", 3.4),
                        Column("Mínimo", 0.9, align="right"),
                        Column("Existencia", 1.1, align="right"),
                        Column("Conteo físico", 1.5, writable=True),
                    ),
                    rows=rows,
                    empty_message="No hay productos para los filtros indicados.",
                ),
            ],
        )

        return report_pdf_response(
            buffer,
            f"stock-por-ubicacion-{_file_date()}.pdf",
        )


class PurchasesBySupplierReportPdfView(APIView):
    permission_classes = [ReportsPermission]

    def get(self, request):
        date_from, date_to, error_response = parse_report_dates(request)

        if error_response is not None:
            return error_response

        results = purchases_by_supplier_results(date_from, date_to)

        rows = [
            (
                item["supplier"]["name"],
                str(item["purchase_count"]),
                format_amount(item["invoice_subtotal"]),
            )
            for item in results
        ]

        totals = None

        if results:
            totals = (
                "Total",
                str(sum(item["purchase_count"] for item in results)),
                format_amount(
                    sum(item["invoice_subtotal"] for item in results)
                ),
            )

        buffer = build_report_pdf(
            title="Compras por proveedor",
            subtitle_lines=[
                f"{format_date_range(date_from, date_to)}. Compras confirmadas.",
                f"{AMOUNTS_IN_CRC} Las compras en dólares se convierten con "
                "su tipo de cambio.",
            ],
            blocks=[
                Table(
                    columns=(
                        Column("Proveedor", 4),
                        Column("Compras", 1, align="right"),
                        Column("Subtotal facturado", 1.8, align="right"),
                    ),
                    rows=rows,
                    totals=totals,
                    empty_message="No hay compras en el rango indicado.",
                ),
            ],
        )

        return report_pdf_response(
            buffer,
            f"compras-por-proveedor-{_file_date()}.pdf",
        )


class ProductSupplierPricesReportPdfView(APIView):
    permission_classes = [ReportsPermission]

    def get(self, request):
        product, error_response = report_product(request)

        if error_response is not None:
            return error_response

        results = product_supplier_prices_results(product)

        summary_rows = [
            (
                item["supplier"]["name"],
                str(item["purchase_count"]),
                format_date(item["last_purchase_date"]),
                format_amount(item["last_unit_cost"]),
                format_amount(item["average_unit_cost"]),
            )
            for item in results
        ]

        history_rows = []

        for item in results:
            history_rows.append(GroupRow(label=item["supplier"]["name"]))

            for purchase in item["purchases"]:
                history_rows.append(
                    (
                        format_date(purchase["purchase_date"]),
                        purchase["invoice_number"] or f"#{purchase['id']}",
                        format_amount(purchase["unit_cost"]),
                    )
                )

        blocks = [
            Table(
                title="Resumen por proveedor",
                columns=(
                    Column("Proveedor", 3),
                    Column("Compras", 0.9, align="right"),
                    Column("Última compra", 1.3),
                    Column("Último costo", 1.4, align="right"),
                    Column("Costo promedio", 1.4, align="right"),
                ),
                rows=summary_rows,
                empty_message="Este producto no tiene compras confirmadas.",
            ),
        ]

        if history_rows:
            blocks.append(
                Table(
                    title="Historial de compras",
                    columns=(
                        Column("Fecha", 1.2),
                        Column("Factura", 2.6),
                        Column("Costo unitario", 1.4, align="right"),
                    ),
                    rows=history_rows,
                )
            )

        buffer = build_report_pdf(
            title="Comparación de precios por proveedor",
            subtitle_lines=[
                f"Producto: {product.standard_code} — {product.name}.",
                "Costo unitario en colones; las compras en dólares se "
                "convierten con su tipo de cambio.",
            ],
            blocks=blocks,
        )

        return report_pdf_response(
            buffer,
            f"precios-por-proveedor-{product.standard_code}.pdf",
        )


GROUP_BY_LABELS = {
    "day": "por día",
    "week": "por semana (sábado a viernes)",
    "month": "por mes",
}

MONTH_NAMES = (
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
)

SUMMARY_FIELD_LABELS = {
    "count": "Documentos",
    "subtotal": "Subtotal",
    "discount": "Descuentos",
    "tax": "Impuestos",
    "total": "Total cobrado",
    "business_income": "Ingreso del negocio",
}


def _period_label(period, group_by):
    start = period["period_start"]
    end = period["period_end"]

    if group_by == "day":
        return format_date(start)

    if group_by == "month":
        return f"{MONTH_NAMES[start.month - 1]} {start.year}"

    return f"{start.strftime('%d/%m')} – {format_date(end)}"


def _summary_value(block, field):
    value = block[field]

    return str(value) if field == "count" else format_amount(value)


def _signed(value, field):
    text = str(abs(value)) if field == "count" else format_amount(abs(value))

    if value > 0:
        return f"+{text}"

    if value < 0:
        return f"-{text}"

    return text


class SalesSummaryReportPdfView(APIView):
    permission_classes = [ReportsPermission]

    def get(self, request):
        params, error_response = parse_sales_summary_params(request)

        if error_response is not None:
            return error_response

        data = sales_summary_data(params)
        summary = data["summary"]

        summary_rows = [
            (
                SUMMARY_FIELD_LABELS[field],
                _summary_value(summary["sales"], field),
                _summary_value(summary["services"], field),
                _summary_value(summary["total"], field),
            )
            for field in COMPARED_FIELDS
        ]

        summary_rows.append(GroupRow(label="Por método de pago"))

        for method in PaymentMethod:
            summary_rows.append(
                (
                    method.label,
                    format_amount(summary["sales"]["by_method"][method.value]),
                    format_amount(summary["services"]["by_method"][method.value]),
                    format_amount(summary["total"]["by_method"][method.value]),
                )
            )

        blocks = [
            Table(
                title="Resumen del período",
                columns=(
                    Column("Concepto", 2.2),
                    Column("Ventas", 1.3, align="right"),
                    Column("Servicios", 1.3, align="right"),
                    Column("Total", 1.3, align="right"),
                ),
                rows=summary_rows,
            ),
        ]

        comparison = data["comparison"]

        if comparison is not None:
            previous = comparison["summary"]["total"]
            variation = comparison["variation"]["total"]

            comparison_rows = []

            for field in COMPARED_FIELDS:
                percentage = variation[field]["percentage"]

                comparison_rows.append(
                    (
                        SUMMARY_FIELD_LABELS[field],
                        _summary_value(summary["total"], field),
                        _summary_value(previous, field),
                        _signed(variation[field]["amount"], field),
                        (
                            f"{'+' if percentage > 0 else ''}{percentage} %"
                            if percentage is not None
                            else "—"
                        ),
                    )
                )

            blocks.append(
                Table(
                    title=(
                        "Comparación con el período "
                        + format_date_range(
                            comparison["date_from"],
                            comparison["date_to"],
                        ).lower()
                        + " (ventas + servicios)"
                    ),
                    columns=(
                        Column("Concepto", 2.2),
                        Column("Este período", 1.3, align="right"),
                        Column("Período anterior", 1.3, align="right"),
                        Column("Variación", 1.3, align="right"),
                        Column("%", 0.8, align="right"),
                    ),
                    rows=comparison_rows,
                )
            )

        period_rows = [
            (
                _period_label(period, data["group_by"]),
                str(period["total"]["count"]),
                format_amount(period["total"]["subtotal"]),
                format_amount(period["total"]["discount"]),
                format_amount(period["total"]["tax"]),
                format_amount(period["total"]["total"]),
                format_amount(period["total"]["business_income"]),
            )
            for period in data["periods"]
        ]

        blocks.append(
            Table(
                title="Por período (ventas + servicios)",
                columns=(
                    Column("Período", 1.8),
                    Column("Docs.", 0.7, align="right"),
                    Column("Subtotal", 1.2, align="right"),
                    Column("Descuentos", 1.2, align="right"),
                    Column("Impuestos", 1.2, align="right"),
                    Column("Total", 1.2, align="right"),
                    Column("Ingreso", 1.2, align="right"),
                ),
                rows=period_rows,
                empty_message="No hay ventas ni servicios en el rango indicado.",
            )
        )

        buffer = build_report_pdf(
            title="Resumen de ventas",
            subtitle_lines=[
                f"{format_date_range(data['date_from'], data['date_to'])}, "
                f"{GROUP_BY_LABELS[data['group_by']]}.",
                f"{AMOUNTS_IN_CRC} Cuenta lo mismo que el cierre de caja: "
                "ventas confirmadas y servicios entregados, con descuento e "
                "impuesto. Ingreso = total cobrado menos impuestos.",
            ],
            blocks=blocks,
        )

        return report_pdf_response(
            buffer,
            f"resumen-de-ventas-{data['date_from'].isoformat()}"
            f"-a-{data['date_to'].isoformat()}.pdf",
        )


class TopSellingProductsReportPdfView(APIView):
    permission_classes = [ReportsPermission]

    def get(self, request):
        date_from, date_to, error_response = parse_report_dates(request)

        if error_response is not None:
            return error_response

        results = top_selling_products_results(date_from, date_to)

        rows = [
            (
                str(position),
                item["product"]["standard_code"],
                item["product"]["name"],
                str(item["quantity_sold"]),
                format_amount(item["total"]),
            )
            for position, item in enumerate(results, start=1)
        ]

        totals = None

        if results:
            totals = (
                "",
                "Total",
                "",
                str(sum(item["quantity_sold"] for item in results)),
                format_amount(sum(item["total"] for item in results)),
            )

        buffer = build_report_pdf(
            title="Productos más vendidos",
            subtitle_lines=[
                f"{format_date_range(date_from, date_to)}. Ventas confirmadas.",
                f"{AMOUNTS_IN_CRC} Monto bruto: cantidad por precio de la "
                "línea, antes del descuento y el impuesto de cada venta.",
            ],
            blocks=[
                Table(
                    columns=(
                        Column("#", 0.5, align="right"),
                        Column("Código", 1.4),
                        Column("Producto", 3.4),
                        Column("Cantidad", 1, align="right"),
                        Column("Monto bruto", 1.4, align="right"),
                    ),
                    rows=rows,
                    totals=totals,
                    empty_message="No hay ventas en el rango indicado.",
                ),
            ],
        )

        return report_pdf_response(
            buffer,
            f"productos-mas-vendidos-{_file_date()}.pdf",
        )


class TopCustomersReportPdfView(APIView):
    permission_classes = [ReportsPermission]

    def get(self, request):
        date_from, date_to, error_response = parse_report_dates(request)

        if error_response is not None:
            return error_response

        ordering, error_response = parse_top_customers_ordering(request)

        if error_response is not None:
            return error_response

        results = top_customers_results(date_from, date_to, ordering)

        rows = [
            (
                str(position),
                item["customer"]["display_name"],
                str(item["sale_count"]),
                format_amount(item["total"]),
            )
            for position, item in enumerate(results, start=1)
        ]

        totals = None

        if results:
            totals = (
                "",
                "Total",
                str(sum(item["sale_count"] for item in results)),
                format_amount(sum(item["total"] for item in results)),
            )

        ordering_label = (
            "por cantidad de ventas"
            if ordering == "sale_count"
            else "por total cobrado"
        )

        buffer = build_report_pdf(
            title="Clientes con más ventas",
            subtitle_lines=[
                f"{format_date_range(date_from, date_to)}, ordenado "
                f"{ordering_label}. Ventas confirmadas con cliente.",
                f"{AMOUNTS_IN_CRC} Total cobrado: con descuento e impuesto.",
            ],
            blocks=[
                Table(
                    columns=(
                        Column("#", 0.5, align="right"),
                        Column("Cliente", 4.2),
                        Column("Ventas", 1, align="right"),
                        Column("Total cobrado", 1.6, align="right"),
                    ),
                    rows=rows,
                    totals=totals,
                    empty_message="No hay ventas con cliente en el rango indicado.",
                ),
            ],
        )

        return report_pdf_response(
            buffer,
            f"clientes-con-mas-ventas-{_file_date()}.pdf",
        )
