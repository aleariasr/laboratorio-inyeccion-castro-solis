from django.db.models import Case, IntegerField, Q, Value, When
from django.http import FileResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed, ValidationError
from rest_framework.response import Response

from apps.core.permissions import LocationsPermission, ProductsPermission
from apps.core.query_params import (
    parse_boolean_query_param,
    parse_positive_integer_query_param,
)
from apps.inventory.models import (
    Product,
    StorageLocation,
)
from apps.inventory.selectors import (
    current_stock_bulk,
    product_ordering_expressions,
    with_latest_suggested_price,
)
from apps.inventory.selectors.products import PRODUCT_ORDERINGS
from apps.inventory.serializers import (
    ProductSerializer,
    ProductVariantCreateSerializer,
    StorageLocationSerializer,
)
from apps.inventory.services.product_labels import (
    MAX_LABELS_PER_DOCUMENT,
    build_location_labels,
    build_product_labels,
    generate_location_labels_pdf,
    generate_product_labels_pdf,
)


def _is_positive_integer(value) -> bool:
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and value > 0
    )


def _parse_label_product_ids(product_ids):
    """
    `product_ids` de ProductViewSet.labels: una copia de cada producto.
    Devuelve ([(product_id, copias)], None) o ([], mensaje de error).
    """

    if not isinstance(product_ids, list):
        return [], "Debe enviar una lista de identificadores."

    if not product_ids:
        return [], "Seleccione al menos un producto."

    if not all(_is_positive_integer(product_id) for product_id in product_ids):
        return [], (
            "Todos los identificadores deben "
            "ser números enteros positivos."
        )

    return [(product_id, 1) for product_id in product_ids], None


def _parse_label_items(items):
    """
    `items` de ProductViewSet.labels (punto 4): [{product_id, copies}].
    Devuelve ([(product_id, copias)], None) o ([], mensaje de error).
    """

    if not isinstance(items, list):
        return [], "Debe enviar una lista de productos."

    if not items:
        return [], "Seleccione al menos un producto."

    requested = []

    for item in items:
        if (
            not isinstance(item, dict)
            or not _is_positive_integer(item.get("product_id"))
            or not _is_positive_integer(item.get("copies"))
        ):
            return [], (
                "Cada producto debe indicar su identificador y la "
                "cantidad de copias, como números enteros positivos."
            )

        requested.append((item["product_id"], item["copies"]))

    return requested, None


class NonDestructiveDeleteMixin:
    """
    Impide el borrado físico de entidades operativas.

    Estas entidades deben desactivarse mediante PATCH y conservarse
    para mantener trazabilidad y relaciones históricas.
    """

    def destroy(self, request, *args, **kwargs):
        raise MethodNotAllowed(
            method="DELETE",
            detail=(
                "Este registro no puede eliminarse. "
                "Debe desactivarlo mediante una actualización."
            ),
        )


class StorageLocationViewSet(
    NonDestructiveDeleteMixin,
    viewsets.ModelViewSet,
):
    serializer_class = StorageLocationSerializer
    permission_classes = [LocationsPermission]

    def get_queryset(self):
        queryset = StorageLocation.objects.order_by(
            "code",
        )

        query = self.request.query_params.get(
            "q",
            "",
        ).strip()

        is_active = parse_boolean_query_param(
            self.request.query_params.get(
                "is_active",
            ),
            name="is_active",
        )

        if query:
            queryset = queryset.filter(
                Q(code__icontains=query)
                | Q(description__icontains=query)
            )

        if is_active is not None:
            queryset = queryset.filter(
                is_active=is_active,
            )

        return queryset

    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    def perform_update(self, serializer):
        serializer.save(
            updated_by=self.request.user,
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="labels",
    )
    def labels(self, request):
        location_ids = request.data.get(
            "location_ids",
        )

        if not isinstance(location_ids, list):
            return Response(
                {
                    "location_ids": [
                        "Debe enviar una lista de identificadores."
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not location_ids:
            return Response(
                {
                    "location_ids": [
                        "Debe seleccionar al menos una ubicación."
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        normalized_ids: list[int] = []

        for location_id in location_ids:
            if (
                isinstance(location_id, bool)
                or not isinstance(
                    location_id,
                    int,
                )
                or location_id <= 0
            ):
                return Response(
                    {
                        "location_ids": [
                            (
                                "Todos los identificadores "
                                "deben ser números enteros positivos."
                            )
                        ],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if location_id not in normalized_ids:
                normalized_ids.append(
                    location_id,
                )

        if (
            len(normalized_ids)
            > MAX_LABELS_PER_DOCUMENT
        ):
            return Response(
                {
                    "location_ids": [
                        (
                            "No puede generar más de "
                            f"{MAX_LABELS_PER_DOCUMENT} "
                            "etiquetas por documento."
                        )
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        locations = list(
            StorageLocation.objects.filter(
                id__in=normalized_ids,
            ).order_by("code"),
        )

        found_ids = {
            location.id
            for location in locations
        }

        missing_ids = [
            location_id
            for location_id in normalized_ids
            if location_id not in found_ids
        ]

        if missing_ids:
            missing_ids_text = ", ".join(
                str(location_id)
                for location_id in missing_ids
            )

            return Response(
                {
                    "location_ids": [
                        (
                            "No existen las siguientes "
                            f"ubicaciones: {missing_ids_text}."
                        )
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        labels = build_location_labels(
            locations,
        )

        pdf_buffer = (
            generate_location_labels_pdf(
                labels,
            )
        )

        return FileResponse(
            pdf_buffer,
            content_type="application/pdf",
            as_attachment=True,
            filename="etiquetas-ubicaciones.pdf",
        )


class ProductViewSet(
    NonDestructiveDeleteMixin,
    viewsets.ModelViewSet,
):
    serializer_class = ProductSerializer
    permission_classes = [ProductsPermission]

    def get_queryset(self):
        queryset = with_latest_suggested_price(
            current_stock_bulk(),
        ).select_related(
            "storage_location",
        )

        query = self.request.query_params.get("q", "").strip()
        standard_code = self.request.query_params.get(
            "standard_code",
            "",
        ).strip()
        storage_location_id = parse_positive_integer_query_param(
            self.request.query_params.get("storage_location"),
            name="storage_location",
        )
        is_active = parse_boolean_query_param(
            self.request.query_params.get("is_active"),
            name="is_active",
        )
        ordering_expressions = self._ordering_expressions()

        if standard_code:
            queryset = queryset.filter(
                standard_code__iexact=standard_code,
            )

        if query:
            queryset = queryset.filter(
                Q(standard_code__icontains=query)
                | Q(own_code__icontains=query)
                | Q(name__icontains=query)
                | Q(description__icontains=query)
                | Q(storage_location__code__icontains=query)
            ).annotate(
                is_exact_code_match=Case(
                    When(
                        Q(standard_code__iexact=query)
                        | Q(own_code__iexact=query),
                        then=Value(0),
                    ),
                    default=Value(1),
                    output_field=IntegerField(),
                ),
            ).order_by(
                "is_exact_code_match",
                *(ordering_expressions or ["standard_code"]),
            )
        elif ordering_expressions:
            queryset = queryset.order_by(*ordering_expressions)

        if storage_location_id is not None:
            queryset = queryset.filter(
                storage_location_id=storage_location_id,
            )

        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)

        return queryset

    def _ordering_expressions(self):
        """
        Punto 2: `?ordering=` de la lista (ver PRODUCT_ORDERINGS). Sin el
        parámetro, None: queda el orden de siempre, que es el que usan los
        buscadores de venta, compra y servicio. Con búsqueda, la
        coincidencia exacta de código sigue primero.
        """

        ordering = self.request.query_params.get("ordering", "").strip()

        if not ordering:
            return None

        expressions = product_ordering_expressions(ordering)

        if expressions is None:
            raise ValidationError(
                {
                    "ordering": [
                        "Orden no válido. Opciones: "
                        + ", ".join(PRODUCT_ORDERINGS)
                        + " (con - delante para descendente)."
                    ],
                }
            )

        return expressions

    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    def perform_update(self, serializer):
        serializer.save(
            updated_by=self.request.user,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="add-variant",
    )
    def add_variant(self, request, pk=None):
        parent = self.get_object()

        serializer = ProductVariantCreateSerializer(
            data=request.data,
            context=self.get_serializer_context(),
        )
        serializer.is_valid(raise_exception=True)

        validated_data = dict(serializer.validated_data)
        validated_data.setdefault(
            "unit_of_measure",
            parent.unit_of_measure,
        )
        # Punto 16: la ubicación del padre es solo el valor por defecto.
        validated_data.setdefault(
            "storage_location",
            parent.storage_location,
        )

        variant = Product.objects.create(
            standard_code=parent.standard_code,
            created_by=request.user,
            updated_by=request.user,
            **validated_data,
        )

        return Response(
            # Con el contexto, para que latest_suggested_price se resuelva
            # según los permisos de quien pide (ver ProductSerializer).
            ProductSerializer(
                variant,
                context=self.get_serializer_context(),
            ).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="labels",
    )
    def labels(self, request):
        """
        Etiquetas de productos en PDF, en el orden en que llegan.

        Punto 4 del plan del 2026-10-22: `items` = [{product_id, copies}],
        y las copias de un producto salen seguidas. `product_ids` (una
        copia de cada uno) se sigue aceptando. Un producto repetido suma
        sus copias en su primera posición. El tope cuenta etiquetas
        (copias), no productos.
        """

        if "items" in request.data:
            field = "items"
            requested, error = _parse_label_items(
                request.data.get("items"),
            )
        else:
            field = "product_ids"
            requested, error = _parse_label_product_ids(
                request.data.get("product_ids"),
            )

        if error:
            return Response(
                {field: [error]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        copies_by_id: dict[int, int] = {}

        for product_id, copies in requested:
            copies_by_id[product_id] = (
                copies_by_id.get(product_id, 0) + copies
            )

        total_labels = sum(copies_by_id.values())

        if total_labels > MAX_LABELS_PER_DOCUMENT:
            return Response(
                {
                    field: [
                        (
                            "No puede generar más de "
                            f"{MAX_LABELS_PER_DOCUMENT} etiquetas "
                            "en un mismo documento "
                            f"(se pidieron {total_labels})."
                        ),
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        products_by_id = {
            product.id: product
            for product in (
                Product.objects
                .select_related("storage_location")
                .filter(id__in=list(copies_by_id))
            )
        }

        missing_ids = [
            product_id
            for product_id in copies_by_id
            if product_id not in products_by_id
        ]

        if missing_ids:
            return Response(
                {
                    field: [
                        (
                            "No existen productos con los "
                            "siguientes identificadores: "
                            + ", ".join(
                                str(product_id)
                                for product_id in missing_ids
                            )
                            + "."
                        ),
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        ordered_products = [
            products_by_id[product_id]
            for product_id, copies in copies_by_id.items()
            for _ in range(copies)
        ]

        labels = build_product_labels(
            ordered_products,
        )

        pdf_buffer = generate_product_labels_pdf(
            labels,
        )

        return FileResponse(
            pdf_buffer,
            as_attachment=True,
            filename="etiquetas-productos.pdf",
            content_type="application/pdf",
        )
