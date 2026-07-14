from django.http import FileResponse
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import InventoryPermission
from apps.inventory.models import Product

from .pdf import build_product_labels_pdf


class ProductLabelsPdfView(APIView):
    permission_classes = [InventoryPermission]

    def get(self, request):
        product_ids = request.query_params.getlist("product")

        if not product_ids:
            return Response(
                {
                    "detail": "Debe indicar al menos un producto."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        products = list(
            Product.objects.select_related(
                "storage_location",
            ).filter(
                id__in=product_ids,
                is_active=True,
            ).order_by(
                "storage_location__code",
                "standard_code",
            )
        )

        if not products:
            return Response(
                {
                    "detail": "No se encontraron productos activos."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        pdf_buffer = build_product_labels_pdf(
            products=products,
        )

        return FileResponse(
            pdf_buffer,
            as_attachment=False,
            filename="product-labels.pdf",
            content_type="application/pdf",
        )