"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";

import { Pagination } from "@/components/data-display/pagination";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { ArrowLeftIcon, TruckIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { canReadProducts, canReadReports } from "@/features/auth/permissions";
import { getProducts } from "@/features/inventory/products/api";
import type { Product } from "@/features/inventory/products/types";
import { formatMoney } from "@/features/inventory/purchases/format";
import { getProductSupplierPricesReport } from "@/features/inventory/reports/api";
import type { ProductSupplierPricesReport } from "@/features/inventory/reports/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

const PAGE_SIZE = 50;

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: ProductSupplierPricesReport }
  | { status: "forbidden" | "error"; message: string };

type ProductSearchState = {
  query: string;
  results: Product[];
  isListOpen: boolean;
  searchError: string | null;
};

const EMPTY_PRODUCT_SEARCH_STATE: ProductSearchState = {
  query: "",
  results: [],
  isListOpen: false,
  searchError: null,
};

function getLoadErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La consulta tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible consultar los precios por proveedor.";
}

export default function ProductSupplierPricesReportPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const productSearchInputRef = useRef<HTMLInputElement>(null);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [productSearch, setProductSearch] = useState<ProductSearchState>(
    EMPTY_PRODUCT_SEARCH_STATE,
  );

  const [page, setPage] = useState(1);

  const [refreshKey, setRefreshKey] = useState(0);

  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });

  const [expandedSupplierIds, setExpandedSupplierIds] = useState<Set<number>>(new Set());

  const hasReportsAccess = user ? canReadReports(user) : false;

  const hasProductsAccess = user ? canReadProducts(user) : false;

  const effectiveProductSearchError = hasProductsAccess
    ? productSearch.searchError
    : "No tiene permiso para buscar productos.";

  useEffect(() => {
    if (!token || selectedProduct || !hasProductsAccess) {
      return;
    }

    const trimmedQuery = productSearch.query.trim();

    if (trimmedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();

    const timeoutId = globalThis.setTimeout(() => {
      getProducts(
        token,
        {
          query: trimmedQuery,
          activeState: "all",
          page: 1,
          pageSize: 20,
        },
        controller.signal,
      )
        .then((response) => {
          if (controller.signal.aborted) {
            return;
          }

          setProductSearch((current) => ({
            ...current,
            results: response.results,
            searchError: null,
          }));
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }

          setProductSearch((current) => ({
            ...current,
            searchError: "No fue posible buscar productos.",
          }));
        });
    }, 350);

    return () => {
      globalThis.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [productSearch.query, selectedProduct, hasProductsAccess, token]);

  useEffect(() => {
    if (authStatus !== "authenticated" || !token || !hasReportsAccess || !selectedProduct) {
      return;
    }

    const controller = new AbortController();

    getProductSupplierPricesReport(
      token,
      {
        productId: selectedProduct.id,
        page,
        pageSize: PAGE_SIZE,
      },
      controller.signal,
    )
      .then((data) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          void logout().then(() => {
            router.replace("/login");
          });

          return;
        }

        if (error instanceof ApiError && error.status === 403) {
          setLoadState({
            status: "forbidden",
            message: "Este usuario no tiene permisos para consultar reportes.",
          });

          return;
        }

        setLoadState({ status: "error", message: getLoadErrorMessage(error) });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasReportsAccess, logout, page, refreshKey, router, selectedProduct, token]);

  function selectProduct(product: Product): void {
    setSelectedProduct(product);
    setProductSearch(EMPTY_PRODUCT_SEARCH_STATE);
    setLoadState({ status: "loading" });
    setExpandedSupplierIds(new Set());
    setPage(1);
  }

  function clearProductFilter(): void {
    setSelectedProduct(null);
    setProductSearch(EMPTY_PRODUCT_SEARCH_STATE);
    setLoadState({ status: "idle" });
    setExpandedSupplierIds(new Set());
    setPage(1);
    productSearchInputRef.current?.focus();
  }

  function toggleSupplierHistory(supplierId: number): void {
    setExpandedSupplierIds((current) => {
      const next = new Set(current);

      if (next.has(supplierId)) {
        next.delete(supplierId);
      } else {
        next.add(supplierId);
      }

      return next;
    });
  }

  function handleRetry(): void {
    setLoadState({ status: "loading" });
    setRefreshKey((current) => current + 1);
  }

  function goBack(): void {
    router.back();
  }

  if (authStatus === "authenticated" && user && !hasReportsAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Este módulo requiere permisos de inventario o de ventas."
      >
        <StatePanel
          title="No tiene acceso a reportes"
          message="Solicite a una persona administradora que revise los permisos de su usuario."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/dashboard");
              }}
            >
              Volver al inicio
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Comparación de precios por proveedor"
      description="Busque un producto para comparar el precio pagado a cada proveedor, en colones."
      actions={
        <Button type="button" variant="secondary" onClick={goBack}>
          <ArrowLeftIcon />
          Volver
        </Button>
      }
    >
      <div className="mb-5 rounded-[var(--radius-xl)] bg-surface p-5 shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)] sm:p-6">
        <div className="w-full sm:max-w-md">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Producto
          </label>

          {selectedProduct ? (
            <div className="flex h-11 items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border bg-surface-muted px-3">
              <span className="truncate text-sm">
                <span className="font-mono font-semibold text-foreground">
                  {selectedProduct.standard_code}
                </span>
                <span className="ml-2 text-muted-foreground">{selectedProduct.name}</span>
              </span>

              <button
                type="button"
                onClick={clearProductFilter}
                className="shrink-0 text-xs font-semibold text-primary hover:underline"
              >
                Quitar
              </button>
            </div>
          ) : (
            <div className="relative">
              <Input
                ref={productSearchInputRef}
                value={productSearch.query}
                onChange={(event) => {
                  const nextValue = event.target.value;

                  setProductSearch((current) => ({
                    ...current,
                    query: nextValue,
                    isListOpen: true,
                    results: nextValue.trim().length < 2 ? [] : current.results,
                    searchError: nextValue.trim().length < 2 ? null : current.searchError,
                  }));
                }}
                onFocus={() => {
                  setProductSearch((current) => ({ ...current, isListOpen: true }));
                }}
                onBlur={() => {
                  globalThis.setTimeout(() => {
                    setProductSearch((current) => ({ ...current, isListOpen: false }));
                  }, 150);
                }}
                placeholder="Código o nombre del producto"
                aria-label="Buscar producto"
                autoComplete="off"
                spellCheck={false}
                className="h-11"
              />

              {productSearch.isListOpen && productSearch.query.trim().length >= 2 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-md)]">
                  {effectiveProductSearchError && (
                    <p className="px-4 py-3 text-sm text-[var(--color-danger)]">
                      {effectiveProductSearchError}
                    </p>
                  )}

                  {!effectiveProductSearchError && productSearch.results.length === 0 && (
                    <p className="px-4 py-3 text-sm text-muted-foreground">Sin resultados.</p>
                  )}

                  {!effectiveProductSearchError && productSearch.results.length > 0 && (
                    <ul className="max-h-64 overflow-y-auto">
                      {productSearch.results.map((product) => (
                        <li key={product.id}>
                          <button
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              selectProduct(product);
                            }}
                            className="block w-full px-4 py-2.5 text-left text-sm hover:bg-surface-muted"
                          >
                            <span className="font-mono font-semibold text-foreground">
                              {product.standard_code}
                            </span>

                            <span className="ml-2 text-muted-foreground">{product.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!selectedProduct && loadState.status === "idle" && (
        <StatePanel
          title="Seleccione un producto"
          message="Busque un producto para comparar el precio pagado a cada proveedor del que se ha comprado."
          icon={<TruckIcon />}
        />
      )}

      {loadState.status === "loading" && (
        <div className="rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]">
          <LoadingState message="Consultando precios…" />
        </div>
      )}

      {loadState.status === "forbidden" && (
        <StatePanel title="Acceso restringido" message={loadState.message} tone="warning" />
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar el reporte"
          message={loadState.message}
          tone="error"
          action={
            <Button type="button" onClick={handleRetry}>
              Reintentar
            </Button>
          }
        />
      )}

      {loadState.status === "success" && loadState.data.results.length === 0 && (
        <StatePanel
          title="Sin compras registradas"
          message="No hay compras confirmadas de este producto a ningún proveedor."
          icon={<TruckIcon />}
        />
      )}

      {loadState.status === "success" && loadState.data.results.length > 0 && (
        <div className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Proveedor
                  </th>

                  <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Compras
                  </th>

                  <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Última compra
                  </th>

                  <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Último precio
                  </th>

                  <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Precio promedio
                  </th>

                  <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Historial
                  </th>
                </tr>
              </thead>

              <tbody>
                {loadState.data.results.map((entry) => {
                  const isExpanded = expandedSupplierIds.has(entry.supplier.id);

                  return (
                    <Fragment key={entry.supplier.id}>
                      <tr className="border-b border-[var(--color-border-soft)] last:border-b-0">
                        <td className="px-5 py-4 align-top text-sm">
                          <Link
                            href={`/inventory/suppliers/${entry.supplier.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {entry.supplier.name}
                          </Link>
                        </td>

                        <td className="px-5 py-4 text-right align-top text-sm text-muted-foreground">
                          {entry.purchase_count}
                        </td>

                        <td className="px-5 py-4 text-right align-top text-sm text-muted-foreground">
                          {entry.last_purchase_date}
                        </td>

                        <td className="px-5 py-4 text-right align-top text-sm font-semibold text-foreground">
                          {formatMoney(entry.last_unit_cost)} {entry.currency}
                        </td>

                        <td className="px-5 py-4 text-right align-top text-sm text-muted-foreground">
                          {formatMoney(entry.average_unit_cost)} {entry.currency}
                        </td>

                        <td className="px-5 py-4 text-right align-top text-sm">
                          <button
                            type="button"
                            onClick={() => {
                              toggleSupplierHistory(entry.supplier.id);
                            }}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            {isExpanded ? "Ocultar" : "Ver historial"}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/40 last:border-b-0">
                          <td colSpan={6} className="px-5 py-4">
                            <table className="w-full min-w-[420px] border-collapse">
                              <thead>
                                <tr className="text-left">
                                  <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                                    Fecha
                                  </th>

                                  <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                                    Factura
                                  </th>

                                  <th className="pb-2 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                                    Precio unitario
                                  </th>
                                </tr>
                              </thead>

                              <tbody>
                                {entry.purchases.map((purchaseEntry) => (
                                  <tr key={purchaseEntry.id}>
                                    <td className="py-1.5 pr-4 text-sm text-muted-foreground">
                                      {purchaseEntry.purchase_date}
                                    </td>

                                    <td className="py-1.5 pr-4 text-sm text-muted-foreground">
                                      {purchaseEntry.invoice_number}
                                    </td>

                                    <td className="py-1.5 text-right text-sm font-medium text-foreground">
                                      {formatMoney(purchaseEntry.unit_cost)} {purchaseEntry.currency}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            totalItems={loadState.data.count}
            hasNextPage={loadState.data.next !== null}
            hasPreviousPage={loadState.data.previous !== null}
            onPageChange={(nextPage) => {
              setLoadState({ status: "loading" });
              setPage(nextPage);
            }}
          />
        </div>
      )}
    </AppShell>
  );
}
