from .dashboard import DashboardSummaryView
from .reports import (
    LowStockProductsReportView,
    ProductMovementsReportView,
    ProductSupplierPricesReportView,
    PurchasesBySupplierReportView,
    StockByLocationReportView,
    TopCustomersReportView,
    TopSellingProductsReportView,
)
from .report_pdfs import (
    LowStockProductsReportPdfView,
    ProductSupplierPricesReportPdfView,
    PurchasesBySupplierReportPdfView,
    SalesSummaryReportPdfView,
    StockByLocationReportPdfView,
    TopCustomersReportPdfView,
    TopSellingProductsReportPdfView,
)
from .sales_summary import SalesSummaryReportView
from .search import UniversalSearchView

__all__ = [
    "DashboardSummaryView",
    "LowStockProductsReportPdfView",
    "LowStockProductsReportView",
    "ProductMovementsReportView",
    "ProductSupplierPricesReportPdfView",
    "ProductSupplierPricesReportView",
    "PurchasesBySupplierReportPdfView",
    "PurchasesBySupplierReportView",
    "SalesSummaryReportPdfView",
    "SalesSummaryReportView",
    "StockByLocationReportPdfView",
    "StockByLocationReportView",
    "TopCustomersReportPdfView",
    "TopCustomersReportView",
    "TopSellingProductsReportPdfView",
    "TopSellingProductsReportView",
    "UniversalSearchView",
]
