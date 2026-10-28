from django.db import transaction
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core.locking import lock_document
from apps.core.permissions import TransfersPermission
from apps.core.query_params import (
    parse_boolean_query_param,
    parse_date_query_param,
    parse_positive_integer_query_param,
)
from apps.documents.report_pdf import (
    Column,
    KeyValues,
    Table,
    TextBlock,
    build_report_pdf,
    format_date,
    format_datetime,
    report_pdf_response,
)
from apps.inventory.exceptions import StockTransferError
from apps.inventory.models import (
    Branch,
    StockTransfer,
    StockTransferItem,
    StockTransferStatus,
)
from apps.inventory.serializers import (
    BranchSerializer,
    StockTransferCancellationSerializer,
    StockTransferItemSerializer,
    StockTransferSerializer,
)
from apps.inventory.services import (
    cancel_stock_transfer,
    confirm_stock_transfer,
)

from .product import NonDestructiveDeleteMixin


def lock_draft_transfer(transfer_id, message):
    """El traslado bloqueado mientras se escribe en él (ver lock_document)."""

    return lock_document(
        StockTransfer,
        transfer_id,
        editable_statuses={StockTransferStatus.DRAFT},
        message=message,
    )


class BranchViewSet(NonDestructiveDeleteMixin, viewsets.ModelViewSet):
    """Sedes (punto 6 del plan del 2026-10-22). Solo el Administrador."""

    serializer_class = BranchSerializer
    permission_classes = [TransfersPermission]
    pagination_class = None

    def get_queryset(self):
        queryset = Branch.objects.order_by("name")

        is_active = parse_boolean_query_param(
            self.request.query_params.get("is_active"),
            name="is_active",
        )

        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)

        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


class StockTransferViewSet(viewsets.ModelViewSet):
    """
    Traslados a otra sede (punto 6). Borrador → confirmar (sale el
    inventario) → anular (vuelve). Solo el Administrador.
    """

    serializer_class = StockTransferSerializer
    permission_classes = [TransfersPermission]

    def get_queryset(self):
        queryset = (
            StockTransfer.objects
            .select_related("branch", "created_by", "confirmed_by", "cancelled_by")
            .prefetch_related("items__product__storage_location")
            .order_by("-transfer_date", "-id")
        )

        params = self.request.query_params
        status_value = params.get("status", "").strip().upper()
        branch_id = parse_positive_integer_query_param(
            params.get("branch"),
            name="branch",
        )
        query = params.get("q", "").strip()
        date_from = parse_date_query_param(params.get("date_from"), name="date_from")
        date_to = parse_date_query_param(params.get("date_to"), name="date_to")

        if date_from and date_to and date_from > date_to:
            raise ValidationError(
                {"date_to": ["date_to no puede ser anterior a date_from."]}
            )

        if status_value:
            if status_value not in StockTransferStatus.values:
                raise ValidationError({"status": ["Estado no válido."]})

            queryset = queryset.filter(status=status_value)

        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)

        if query:
            # Número del traslado, o un producto que lleve.
            number_filter = Q(id=int(query)) if query.isdigit() else Q()

            queryset = queryset.filter(
                number_filter
                | Q(items__product__standard_code__icontains=query)
                | Q(items__product__own_code__icontains=query)
                | Q(items__product__name__icontains=query)
            ).distinct()

        if date_from:
            queryset = queryset.filter(transfer_date__gte=date_from)

        if date_to:
            queryset = queryset.filter(transfer_date__lte=date_to)

        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.instance = lock_draft_transfer(
            serializer.instance.pk,
            "Solo se modifica un traslado en borrador.",
        )
        serializer.save(updated_by=self.request.user)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        stock_transfer = lock_draft_transfer(
            self.get_object().pk,
            "Solo se elimina un traslado en borrador; uno confirmado se anula.",
        )

        self.perform_destroy(stock_transfer)

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="confirm")
    def confirm(self, request, pk=None):
        try:
            stock_transfer = confirm_stock_transfer(
                stock_transfer=self.get_object(),
                user=request.user,
            )
        except StockTransferError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(self.get_serializer(self.get_queryset().get(pk=stock_transfer.pk)).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        input_serializer = StockTransferCancellationSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)

        try:
            stock_transfer = cancel_stock_transfer(
                stock_transfer=self.get_object(),
                user=request.user,
                reason=input_serializer.validated_data["reason"],
            )
        except StockTransferError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(self.get_serializer(self.get_queryset().get(pk=stock_transfer.pk)).data)

    @action(detail=True, methods=["get"], url_path="guide")
    def guide(self, request, pk=None):
        """
        PDF "Guía de traslado": sede, fecha, número, productos y
        cantidades, sin costos ni precios. La columna "Recibido" va vacía
        para anotarla en la otra sede, y al final el recuadro de revisión.
        """

        stock_transfer = self.get_object()
        items = sorted(
            stock_transfer.items.all(),
            key=lambda item: (item.product.storage_location.code, item.product.standard_code),
        )

        details = [
            ("Sede de destino", stock_transfer.branch.name, True),
            ("Fecha del traslado", format_date(stock_transfer.transfer_date)),
            ("Estado", stock_transfer.get_status_display()),
        ]

        if stock_transfer.confirmed_at:
            details.append(
                (
                    "Confirmado",
                    f"{format_datetime(stock_transfer.confirmed_at)} "
                    f"por {stock_transfer.confirmed_by.get_username()}",
                )
            )

        if stock_transfer.cancelled_at:
            details.append(
                (
                    "Anulado",
                    f"{format_datetime(stock_transfer.cancelled_at)} "
                    f"por {stock_transfer.cancelled_by.get_username()}",
                )
            )
            details.append(("Motivo de anulación", stock_transfer.cancellation_reason or "—"))

        total_quantity = sum(item.quantity for item in items)

        blocks = [
            KeyValues(rows=details),
            Table(
                title="Productos",
                columns=(
                    Column("Ubicación", 0.9),
                    Column("Código", 1.4),
                    Column("Producto", 3),
                    Column("Cantidad", 0.9, align="right"),
                    Column("Recibido", 0.9, writable=True),
                ),
                rows=[
                    (
                        item.product.storage_location.code,
                        item.product.standard_code,
                        item.product.name,
                        f"{item.quantity} {item.product.unit_of_measure}",
                        "",
                    )
                    for item in items
                ],
                totals=("", "", "Total de unidades", str(total_quantity), ""),
                empty_message="El traslado no tiene productos.",
            ),
        ]

        if stock_transfer.notes:
            blocks.append(TextBlock(title="Notas", text=stock_transfer.notes))

        buffer = build_report_pdf(
            title=f"Guía de traslado #{stock_transfer.id}",
            banner_title="GUÍA DE TRASLADO",
            subtitle_lines=[f"A {stock_transfer.branch.name}"],
            blocks=blocks,
        )

        return report_pdf_response(buffer, f"guia-traslado-{stock_transfer.id}.pdf")


class StockTransferItemViewSet(viewsets.ModelViewSet):
    serializer_class = StockTransferItemSerializer
    permission_classes = [TransfersPermission]
    pagination_class = None

    def get_queryset(self):
        queryset = StockTransferItem.objects.select_related(
            "stock_transfer",
            "product__storage_location",
        ).order_by("id")

        stock_transfer_id = parse_positive_integer_query_param(
            self.request.query_params.get("stock_transfer"),
            name="stock_transfer",
        )

        if stock_transfer_id:
            queryset = queryset.filter(stock_transfer_id=stock_transfer_id)

        return queryset

    @transaction.atomic
    def perform_create(self, serializer):
        lock_draft_transfer(
            serializer.validated_data["stock_transfer"].pk,
            "Solo se modifican las líneas de un traslado en borrador.",
        )
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    @transaction.atomic
    def perform_update(self, serializer):
        lock_draft_transfer(
            serializer.instance.stock_transfer_id,
            "Solo se modifican las líneas de un traslado en borrador.",
        )
        serializer.save(updated_by=self.request.user)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        item = self.get_object()

        lock_draft_transfer(
            item.stock_transfer_id,
            "Solo se quitan líneas de un traslado en borrador.",
        )

        self.perform_destroy(item)

        return Response(status=status.HTTP_204_NO_CONTENT)
