from django.db.models import Q
from django.http import FileResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.response import Response

from apps.core.permissions import InventoryPermission
from apps.core.query_params import (
    parse_boolean_query_param,
    parse_positive_integer_query_param,
)
from apps.inventory.models import (
    Product,
    ProductReference,
    StorageLocation,
)
from apps.inventory.selectors import current_stock_bulk
from apps.inventory.serializers import (
    ProductReferenceSerializer,
    ProductSerializer,
    StorageLocationSerializer,
)
from apps.inventory.services.product_labels import (
    MAX_LABELS_PER_DOCUMENT,
    build_location_labels,
    build_product_labels,
    generate_location_labels_pdf,
    generate_product_labels_pdf,
)


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
    permission_classes = [InventoryPermission]

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
    permission_classes = [InventoryPermission]

    def get_queryset(self):
        queryset = current_stock_bulk().select_related(
            "storage_location",
        )

        query = self.request.query_params.get("q", "").strip()
        storage_location_id = parse_positive_integer_query_param(
            self.request.query_params.get("storage_location"),
            name="storage_location",
        )
        is_active = parse_boolean_query_param(
            self.request.query_params.get("is_active"),
            name="is_active",
        )

        if query:
            queryset = queryset.filter(
                Q(standard_code__icontains=query)
                | Q(name__icontains=query)
                | Q(description__icontains=query)
                | Q(storage_location__code__icontains=query)
            )

        if storage_location_id is not None:
            queryset = queryset.filter(
                storage_location_id=storage_location_id,
            )

        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)

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
        product_ids = request.data.get("product_ids")

        if not isinstance(product_ids, list):
            return Response(
                {
                    "product_ids": [
                        "Debe enviar una lista de identificadores."
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not product_ids:
            return Response(
                {
                    "product_ids": [
                        "Seleccione al menos un producto."
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(product_ids) > MAX_LABELS_PER_DOCUMENT:
            return Response(
                {
                    "product_ids": [
                        (
                            "No puede generar más de "
                            f"{MAX_LABELS_PER_DOCUMENT} etiquetas "
                            "en un mismo documento."
                        ),
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        normalized_ids: list[int] = []
        seen_ids: set[int] = set()

        for product_id in product_ids:
            if (
                isinstance(product_id, bool)
                or not isinstance(product_id, int)
                or product_id <= 0
            ):
                return Response(
                    {
                        "product_ids": [
                            (
                                "Todos los identificadores deben "
                                "ser números enteros positivos."
                            ),
                        ],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if product_id not in seen_ids:
                seen_ids.add(product_id)
                normalized_ids.append(product_id)

        products_by_id = {
            product.id: product
            for product in (
                Product.objects
                .select_related("storage_location")
                .filter(id__in=normalized_ids)
            )
        }

        missing_ids = [
            product_id
            for product_id in normalized_ids
            if product_id not in products_by_id
        ]

        if missing_ids:
            return Response(
                {
                    "product_ids": [
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
            for product_id in normalized_ids
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


class ProductReferenceViewSet(
    NonDestructiveDeleteMixin,
    viewsets.ModelViewSet,
):
    serializer_class = ProductReferenceSerializer
    permission_classes = [InventoryPermission]

    def get_queryset(self):
        queryset = (
            ProductReference.objects
            .select_related("product")
            .order_by("reference_code")
        )

        query = self.request.query_params.get("q", "").strip()
        product_id = parse_positive_integer_query_param(
            self.request.query_params.get("product"),
            name="product",
        )
        is_active = parse_boolean_query_param(
            self.request.query_params.get("is_active"),
            name="is_active",
        )

        if query:
            queryset = queryset.filter(
                Q(reference_code__icontains=query)
                | Q(manufacturer__icontains=query)
                | Q(description__icontains=query)
                | Q(product__standard_code__icontains=query)
                | Q(product__name__icontains=query)
            )

        if product_id is not None:
            queryset = queryset.filter(product_id=product_id)

        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)

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
