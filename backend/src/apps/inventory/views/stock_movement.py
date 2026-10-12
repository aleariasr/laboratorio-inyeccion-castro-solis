from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError

from apps.core.permissions import (
    MovementsPermission,
)
from apps.core.query_params import (
    parse_date_query_param,
    parse_positive_integer_query_param,
)
from apps.documents.report_pdf import (
    Column,
    Table,
    build_report_pdf,
    format_date_range,
    format_datetime,
    report_pdf_response,
)
from apps.documents.report_xlsx import (
    DATETIME_FORMAT,
    INTEGER_FORMAT,
    SIGNED_INTEGER_FORMAT,
    XlsxColumn,
    build_report_xlsx,
    xlsx_response,
)
from apps.inventory.models import (
    MovementDirection,
    Product,
    StockMovement,
    StockMovementType,
    StorageLocation,
)
from apps.inventory.serializers import (
    StockMovementSerializer,
)


class StockMovementViewSet(
    viewsets.ReadOnlyModelViewSet,
):
    serializer_class = StockMovementSerializer
    permission_classes = [MovementsPermission]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["created_at"]
    ordering = ["-created_at", "-id"]

    def get_queryset(self):
        queryset = (
            StockMovement.objects
            .select_related(
                "product",
                "created_by",
                "purchase_item__purchase",
                "sale_item__sale",
                "reverses_movement",
                "inventory_count",
                "service_accessory",
            )
        )

        product_id = parse_positive_integer_query_param(
            self.request.query_params.get("product"),
            name="product",
        )
        location_id = parse_positive_integer_query_param(
            self.request.query_params.get("location"),
            name="location",
        )
        purchase_id = parse_positive_integer_query_param(
            self.request.query_params.get("purchase"),
            name="purchase",
        )
        sale_id = parse_positive_integer_query_param(
            self.request.query_params.get("sale"),
            name="sale",
        )
        inventory_count_id = parse_positive_integer_query_param(
            self.request.query_params.get("inventory_count"),
            name="inventory_count",
        )
        movement_type = self.request.query_params.get(
            "movement_type", "",
        ).strip()
        direction = self.request.query_params.get(
            "direction", "",
        ).strip()
        date_from = parse_date_query_param(
            self.request.query_params.get("date_from"),
            name="date_from",
        )
        date_to = parse_date_query_param(
            self.request.query_params.get("date_to"),
            name="date_to",
        )

        if date_from and date_to and date_from > date_to:
            raise ValidationError(
                {
                    "date_to": [
                        "date_to no puede ser anterior a date_from."
                    ]
                }
            )

        if product_id:
            queryset = queryset.filter(product_id=product_id)

        if location_id:
            queryset = queryset.filter(
                product__storage_location_id=location_id,
            )

        if purchase_id:
            queryset = queryset.filter(
                purchase_item__purchase_id=purchase_id,
            )

        if sale_id:
            queryset = queryset.filter(
                sale_item__sale_id=sale_id,
            )

        if inventory_count_id:
            queryset = queryset.filter(
                inventory_count_id=inventory_count_id,
            )

        if movement_type:
            queryset = queryset.filter(
                movement_type=movement_type.upper(),
            )

        if direction:
            queryset = queryset.filter(
                direction=direction.upper(),
            )

        if date_from:
            queryset = queryset.filter(
                created_at__date__gte=date_from,
            )

        if date_to:
            queryset = queryset.filter(
                created_at__date__lte=date_to,
            )

        return queryset

    def _export_movements(self, request, limit):
        """
        Movimientos para el PDF y el Excel (puntos 2 + 27 y 28), con los
        filtros de la pantalla. Con un producto se calcula el saldo
        acumulado (kardex), como en pantalla. Devuelve (movimientos,
        saldos o None, si se cortó en `limit`).
        """

        queryset = self.filter_queryset(self.get_queryset()).select_related(
            "product__storage_location",
        )
        is_kardex = bool(request.query_params.get("product"))
        ascending = request.query_params.get("ordering") == "created_at"

        if is_kardex:
            queryset = queryset.order_by("created_at", "id")

        movements = list(queryset[: limit + 1])
        truncated = len(movements) > limit
        movements = movements[:limit]

        if not is_kardex:
            return movements, None, truncated

        balance = 0
        balances = []

        for movement in movements:
            balance += (
                movement.quantity
                if movement.direction == MovementDirection.IN
                else -movement.quantity
            )
            balances.append(balance)

        if not ascending:
            movements.reverse()
            balances.reverse()

        return movements, balances, truncated

    @action(detail=False, methods=["get"], url_path="pdf")
    def pdf(self, request):
        """
        PDF de Movimientos (puntos 2 + 27) con los mismos filtros de la
        pantalla. Con un producto sale el kardex (con saldo acumulado),
        igual que en pantalla; sin producto, la lista general. Hasta
        MOVEMENTS_PDF_LIMIT movimientos, el mismo tope del kardex.
        """

        movements, balances, truncated = self._export_movements(
            request,
            MOVEMENTS_PDF_LIMIT,
        )

        subtitle_lines = _movement_filter_lines(
            request,
            limit=MOVEMENTS_PDF_LIMIT,
            truncated=truncated,
            is_kardex=balances is not None,
        )

        if balances is not None:
            table = Table(
                columns=(
                    Column("Fecha", 1.6),
                    Column("Tipo", 1.4),
                    Column("Cantidad", 0.9, align="right"),
                    Column("Saldo", 0.8, align="right"),
                    Column("Origen", 1.8),
                    Column("Usuario", 1.1),
                ),
                rows=[
                    (
                        format_datetime(movement.created_at),
                        movement.get_movement_type_display(),
                        _signed_quantity(movement),
                        str(balance),
                        movement_origin_label(movement),
                        _username(movement),
                    )
                    for movement, balance in zip(movements, balances)
                ],
                empty_message="Este producto no tiene movimientos para el filtro indicado.",
            )
        else:
            table = Table(
                columns=(
                    Column("Fecha", 1.45),
                    Column("Producto", 2.6),
                    Column("Tipo", 1.25),
                    Column("Cant.", 0.65, align="right"),
                    Column("Origen", 1.6),
                    Column("Usuario", 1),
                ),
                rows=[
                    (
                        format_datetime(movement.created_at),
                        f"{movement.product.standard_code} {movement.product.name}",
                        movement.get_movement_type_display(),
                        _signed_quantity(movement),
                        movement_origin_label(movement),
                        _username(movement),
                    )
                    for movement in movements
                ],
                empty_message="No hay movimientos para los filtros indicados.",
            )

        buffer = build_report_pdf(
            title="Movimientos de inventario",
            subtitle_lines=subtitle_lines,
            blocks=[table],
        )

        return report_pdf_response(buffer, "movimientos-de-inventario.pdf")

    @action(detail=False, methods=["get"], url_path="excel")
    def excel(self, request):
        """
        Excel de Movimientos (punto 28) con los mismos filtros de la
        pantalla y todas las columnas, para trabajarlo en Excel. Con un
        producto lleva también el saldo (kardex).
        """

        movements, balances, truncated = self._export_movements(
            request,
            MOVEMENTS_EXCEL_LIMIT,
        )
        is_kardex = balances is not None

        columns = [
            XlsxColumn("Fecha", 17, DATETIME_FORMAT),
            XlsxColumn("Código", 16),
            XlsxColumn("Producto", 36),
            XlsxColumn("Ubicación", 12),
            XlsxColumn("Tipo", 18),
            XlsxColumn("Cantidad", 10, SIGNED_INTEGER_FORMAT),
        ]

        if is_kardex:
            columns.append(XlsxColumn("Saldo", 10, INTEGER_FORMAT))

        columns += [
            XlsxColumn("Origen", 24),
            XlsxColumn("Usuario", 16),
            XlsxColumn("Notas", 40),
        ]

        rows = []

        for index, movement in enumerate(movements):
            row = [
                movement.created_at,
                movement.product.standard_code,
                movement.product.name,
                movement.product.storage_location.code,
                movement.get_movement_type_display(),
                (
                    movement.quantity
                    if movement.direction == MovementDirection.IN
                    else -movement.quantity
                ),
            ]

            if is_kardex:
                row.append(balances[index])

            row += [
                movement_origin_label(movement),
                _username(movement),
                movement.notes,
            ]

            rows.append(row)

        buffer = build_report_xlsx(
            title="Movimientos de inventario",
            sheet_title="Movimientos",
            subtitle_lines=_movement_filter_lines(
                request,
                limit=MOVEMENTS_EXCEL_LIMIT,
                truncated=truncated,
                is_kardex=is_kardex,
            ),
            columns=columns,
            rows=rows,
        )

        return xlsx_response(buffer, "movimientos-de-inventario.xlsx")


MOVEMENTS_PDF_LIMIT = 2000
# Excel aguanta mucho más que un PDF que se va a imprimir.
MOVEMENTS_EXCEL_LIMIT = 20000


def movement_origin_label(movement):
    """
    De dónde viene un movimiento, con el mismo texto que la pantalla
    (frontend/src/features/inventory/movements/origin.ts).
    """

    if movement.purchase_item_id is not None:
        purchase = movement.purchase_item.purchase

        if purchase.invoice_number:
            return f"Compra {purchase.invoice_number}"

        return f"Compra #{purchase.id}"

    if movement.sale_item_id is not None:
        return f"Venta #{movement.sale_item.sale_id}"

    if movement.inventory_count_id is not None:
        reference = movement.inventory_count.reference

        if reference:
            return f"Conteo {reference}"

        return f"Conteo #{movement.inventory_count_id}"

    if (
        movement.service_accessory_id is not None
        and movement.service_accessory.service_record_id is not None
    ):
        return f"Servicio #{movement.service_accessory.service_record_id}"

    if movement.reverses_movement_id is not None:
        return f"Revierte #{movement.reverses_movement_id}"

    if movement.movement_type == StockMovementType.INITIAL:
        return "Inventario inicial"

    return "Sin documento asociado"


def _signed_quantity(movement):
    prefix = "+" if movement.direction == MovementDirection.IN else "-"

    return f"{prefix}{movement.quantity}"


def _username(movement):
    if movement.created_by_id is None:
        return "—"

    return movement.created_by.get_username()


def _movement_filter_lines(request, *, limit, truncated, is_kardex):
    params = request.query_params
    filters = []

    product_id = params.get("product")

    if product_id:
        product = Product.objects.filter(id=product_id).first()

        if product is not None:
            filters.append(f"Producto: {product.standard_code} — {product.name}")

    location_id = params.get("location")

    if location_id:
        location = StorageLocation.objects.filter(id=location_id).first()

        if location is not None:
            filters.append(f"Ubicación: {location.code}")

    movement_type = params.get("movement_type", "").strip().upper()

    if movement_type in StockMovementType.values:
        filters.append(f"Tipo: {StockMovementType(movement_type).label}")

    direction = params.get("direction", "").strip().upper()

    if direction in MovementDirection.values:
        filters.append(f"Dirección: {MovementDirection(direction).label}")

    # Las fechas ya pasaron por get_queryset, que rechaza un formato
    # inválido con 400.
    date_range = format_date_range(
        parse_date_query_param(params.get("date_from"), name="date_from"),
        parse_date_query_param(params.get("date_to"), name="date_to"),
    )
    ordering = (
        "Más antiguos primero."
        if params.get("ordering") == "created_at"
        else "Más recientes primero."
    )

    lines = [f"{date_range}. {ordering}"]

    if filters:
        lines.append(" · ".join(filters) + ".")

    if is_kardex:
        lines.append("Saldo: acumulado sobre los movimientos mostrados.")

    if truncated:
        lines.append(
            f"Se muestran los primeros {limit} movimientos; "
            "use el rango de fechas para acotar."
        )

    return lines
