"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Pagination } from "@/components/data-display/pagination";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { AlertIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canReadReports } from "@/features/auth/permissions";
import { getLowStockProductsReport } from "@/features/inventory/reports/api";
import {
  EMPTY_LOW_STOCK_PRODUCTS_FILTERS,
  type LowStockProductsFilters,
  type LowStockProductsReport,
} from "@/features/inventory/reports/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | { status: "loading" }
  | { status: "success"; data: LowStockProductsReport }
  | { status: "forbidden" | "error"; message: string };

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

  return "No fue posible consultar los productos bajo mínimo.";
}

export default function LowStockProductsPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [filters, setFilters] = useState<LowStockProductsFilters>(EMPTY_LOW_STOCK_PRODUCTS_FILTERS);

  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  const hasReportsAccess = user ? canReadReports(user) : false;

  useEffect(() => {
    if (authStatus !== "authenticated" || !token || !hasReportsAccess) {
      return;
    }

    const controller = new AbortController();

    getLowStockProductsReport(token, filters, controller.signal)
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
  }, [authStatus, filters, hasReportsAccess, logout, router, token]);

  function updateFilters(
    updater: (current: LowStockProductsFilters) => LowStockProductsFilters,
  ): void {
    setLoadState({ status: "loading" });
    setFilters(updater);
  }

  function handleRetry(): void {
    setLoadState({ status: "loading" });
    setFilters((current) => ({ ...current }));
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
      title="Bajo mínimo"
      description="Productos cuya existencia actual está en o por debajo del mínimo establecido."
    >
      {loadState.status === "loading" && (
        <div className="rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]">
          <LoadingState message="Consultando productos…" />
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
          title="Sin productos bajo mínimo"
          message="Todos los productos activos tienen existencias por encima de su mínimo establecido."
          icon={<AlertIcon />}
        />
      )}

      {loadState.status === "success" && loadState.data.results.length > 0 && (
        <div className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Producto
                  </th>

                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Ubicación
                  </th>

                  <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Stock actual
                  </th>

                  <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Mínimo
                  </th>

                  <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Déficit
                  </th>
                </tr>
              </thead>

              <tbody>
                {loadState.data.results.map((product) => (
                  <tr
                    key={product.id}
                    className="border-b border-[var(--color-border-soft)] last:border-b-0"
                  >
                    <td className="px-5 py-4 align-top text-sm">
                      <Link
                        href={`/inventory/products/${product.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        <span className="font-mono">{product.standard_code}</span>
                        <span className="ml-2">{product.name}</span>
                      </Link>
                    </td>

                    <td className="px-5 py-4 align-top text-sm">
                      <Link
                        href={`/inventory/locations/${product.storage_location.id}`}
                        className="inline-flex rounded-[var(--radius-sm)] bg-surface-muted px-2.5 py-1 font-mono text-sm font-semibold text-foreground hover:underline"
                      >
                        {product.storage_location.code}
                      </Link>
                    </td>

                    <td className="px-5 py-4 text-right align-top text-sm font-semibold text-danger">
                      {product.current_stock}
                    </td>

                    <td className="px-5 py-4 text-right align-top text-sm text-muted-foreground">
                      {product.minimum_stock}
                    </td>

                    <td className="px-5 py-4 text-right align-top text-sm font-semibold text-danger">
                      {Math.max(product.minimum_stock - product.current_stock, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={filters.page}
            pageSize={filters.pageSize}
            totalItems={loadState.data.count}
            hasNextPage={loadState.data.next !== null}
            hasPreviousPage={loadState.data.previous !== null}
            onPageChange={(page) => {
              updateFilters((current) => ({ ...current, page }));
            }}
          />
        </div>
      )}
    </AppShell>
  );
}
