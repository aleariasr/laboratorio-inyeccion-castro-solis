from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cash.selectors import pending_closing_week_start
from apps.core.permissions import ROLE_ADMIN
from apps.customers.models import InjectorServiceRecord, InjectorServiceStatus
from apps.inventory.models import Purchase, PurchaseStatus
from apps.inventory.selectors import low_stock_products
from apps.sales.models import Sale, SaleStatus

LOW_STOCK_LIMIT = 5
SERVICES_READY_LIMIT = 10
DRAFT_DOCUMENTS_LIMIT = 5


class DashboardSummaryView(APIView):
    """
    Resumen de pendientes accionables para la pantalla de inicio
    (`/dashboard`) — qué hay que hacer hoy, no solo qué existe. Cada
    sección se omite (queda en `None`) si el usuario no tiene permiso
    de ver ese módulo — mismo patrón de gating que UniversalSearchView.
    """

    permission_classes = [permissions.IsAuthenticated]

    def _can_view(self, request, module):
        user = request.user

        if user.is_superuser or user.groups.filter(name=ROLE_ADMIN).exists():
            return True

        return user.has_perm(f"core.view_{module}")

    def get(self, request):
        data = {
            "low_stock_products": None,
            "services_ready": None,
            "services_in_progress_count": None,
            "draft_sales": None,
            "draft_purchases": None,
            "cash_pending_week_start": None,
        }

        if self._can_view(request, "products"):
            data["low_stock_products"] = self._low_stock_products()

        if self._can_view(request, "services"):
            data["services_ready"] = self._services_ready()
            data["services_in_progress_count"] = (
                InjectorServiceRecord.objects.filter(
                    status=InjectorServiceStatus.IN_PROGRESS,
                ).count()
            )

        if self._can_view(request, "sales"):
            data["draft_sales"] = self._draft_sales()

        if self._can_view(request, "purchases"):
            data["draft_purchases"] = self._draft_purchases()

        if self._can_view(request, "cash"):
            data["cash_pending_week_start"] = pending_closing_week_start()

        return Response(data)

    def _low_stock_products(self):
        products = low_stock_products()[:LOW_STOCK_LIMIT]

        return [
            {
                "id": product.id,
                "standard_code": product.standard_code,
                "name": product.name,
                "current_stock": product.current_stock,
                "minimum_stock": product.minimum_stock,
            }
            for product in products
        ]

    def _services_ready(self):
        service_records = (
            InjectorServiceRecord.objects
            .select_related("injector__customer")
            .filter(status=InjectorServiceStatus.READY)
            .order_by("received_at")[:SERVICES_READY_LIMIT]
        )

        return [
            {
                "id": service_record.id,
                "injector_number": service_record.injector.injector_number,
                "customer_display_name": (
                    service_record.injector.customer.display_name
                ),
            }
            for service_record in service_records
        ]

    def _draft_sales(self):
        sales = (
            Sale.objects
            .select_related("customer")
            .filter(status=SaleStatus.DRAFT)
            .order_by("-sale_date", "-id")[:DRAFT_DOCUMENTS_LIMIT]
        )

        return [
            {
                "id": sale.id,
                "customer_display_name": (
                    sale.customer.display_name if sale.customer_id else None
                ),
                "sale_date": sale.sale_date,
            }
            for sale in sales
        ]

    def _draft_purchases(self):
        purchases = (
            Purchase.objects
            .select_related("supplier")
            .filter(status=PurchaseStatus.DRAFT)
            .order_by("-purchase_date", "-id")[:DRAFT_DOCUMENTS_LIMIT]
        )

        return [
            {
                "id": purchase.id,
                "supplier_name": purchase.supplier.name,
                "invoice_number": purchase.invoice_number,
                "purchase_date": purchase.purchase_date,
            }
            for purchase in purchases
        ]
