"""
Excel de "Productos que más se mueven" (punto 28): ruta hermana
`.../excel/` con los mismos filtros y datos que la consulta, sin
paginar. El Excel de Movimientos está en su propia vista.
"""

from django.utils import timezone
from rest_framework.views import APIView

from apps.core.permissions import ReportsPermission
from apps.documents.report_pdf import format_date_range
from apps.documents.report_xlsx import (
    INTEGER_FORMAT,
    XlsxColumn,
    build_report_xlsx,
    xlsx_response,
)

from .report_pdfs import MOST_MOVED_NOTE
from .reports import most_moved_products_results, parse_report_dates


class MostMovedProductsReportExcelView(APIView):
    permission_classes = [ReportsPermission]

    def get(self, request):
        date_from, date_to, error_response = parse_report_dates(request)

        if error_response is not None:
            return error_response

        results = most_moved_products_results(date_from, date_to)

        buffer = build_report_xlsx(
            title="Productos que más se mueven",
            sheet_title="Más movidos",
            subtitle_lines=[
                f"{format_date_range(date_from, date_to)}. Total movido = "
                "entradas + salidas, en unidades.",
                MOST_MOVED_NOTE,
            ],
            columns=[
                XlsxColumn("#", 6, INTEGER_FORMAT),
                XlsxColumn("Código", 16),
                XlsxColumn("Producto", 36),
                XlsxColumn("Ubicación", 12),
                XlsxColumn("Entradas", 11, INTEGER_FORMAT),
                XlsxColumn("Salidas", 11, INTEGER_FORMAT),
                XlsxColumn("Total movido", 13, INTEGER_FORMAT),
                XlsxColumn("Movimientos", 13, INTEGER_FORMAT),
            ],
            rows=[
                (
                    position,
                    item["product"]["standard_code"],
                    item["product"]["name"],
                    item["location_code"],
                    item["quantity_in"],
                    item["quantity_out"],
                    item["total_moved"],
                    item["movement_count"],
                )
                for position, item in enumerate(results, start=1)
            ],
        )

        return xlsx_response(
            buffer,
            f"productos-que-mas-se-mueven-{timezone.localdate().isoformat()}.xlsx",
        )
