"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Pagination } from "@/components/data-display/pagination";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { ArrowLeftIcon, CartIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { canReadReports } from "@/features/auth/permissions";
import { formatMoney } from "@/features/inventory/purchases/format";
import { getSalesByDateReport } from "@/features/inventory/reports/api";
import {
  EMPTY_REPORT_DATE_FILTERS,
  type ReportDateFilters,
  type SalesByDateReport,
} from "@/features/inventory/reports/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | { status: "loading" }
  | { status: "success"; data: SalesByDateReport }
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

  return "No fue posible consultar las ventas por fecha.";
}

export default function SalesByDateReportPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [filters, setFilters] = useState<ReportDateFilters>(EMPTY_REPORT_DATE_FILTERS);

  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  const hasReportsAccess = user ? canReadReports(user) : false;

  const hasActiveFilters = filters.dateFrom !== "" || filters.dateTo !== "";

  useEffect(() => {
    if (authStatus !== "authenticated" || !token || !hasReportsAccess) {
      return;
    }

    const controller = new AbortController();

    getSalesByDateReport(token, filters, controller.signal)
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
    updater: (current: ReportDateFilters) => ReportDateFilters,
  ): void {
    setLoadState({ status: "loading" });
    setFilters(updater);
  }

  function handleRetry(): void {
    setLoadState({ status: "loading" });
    setFilters((current) => ({ ...current }));
  }

  function handleClearFilters(): void {
    updateFilters(() => EMPTY_REPORT_DATE_FILTERS);
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
      title="Ventas por fecha"
      description="Cantidad de ventas y total facturado por día, en colones."
      actions={
        <Button type="button" variant="secondary" onClick={goBack}>
          <ArrowLeftIcon />
          Volver
        </Button>
      }
    >
      <div className="mb-5 rounded-[var(--radius-xl)] bg-surface p-5 shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div>
            <label
              htmlFor="sales-by-date-date-from"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground"
            >
              Desde
            </label>

            <Input
              id="sales-by-date-date-from"
              type="date"
              value={filters.dateFrom}
              onChange={(event) => {
                const dateFrom = event.target.value;

                updateFilters((current) => ({ ...current, dateFrom, page: 1 }));
              }}
              className="h-11 w-auto"
            />
          </div>

          <div>
            <label
              htmlFor="sales-by-date-date-to"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground"
            >
              Hasta
            </label>

            <Input
              id="sales-by-date-date-to"
              type="date"
              value={filters.dateTo}
              onChange={(event) => {
                const dateTo = event.target.value;

                updateFilters((current) => ({ ...current, dateTo, page: 1 }));
              }}
              className="h-11 w-auto"
            />
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {loadState.status === "loading" && (
        <div className="rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]">
          <LoadingState message="Consultando ventas…" />
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
          title="Sin ventas registradas"
          message={
            hasActiveFilters
              ? "No hay ventas confirmadas para el rango de fechas seleccionado."
              : "Todavía no hay ventas confirmadas en el sistema."
          }
          icon={<CartIcon />}
          action={
            hasActiveFilters ? (
              <Button type="button" variant="secondary" onClick={handleClearFilters}>
                Limpiar filtros
              </Button>
            ) : undefined
          }
        />
      )}

      {loadState.status === "success" && loadState.data.results.length > 0 && (
        <div className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Fecha
                  </th>

                  <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Ventas
                  </th>

                  <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Total
                  </th>
                </tr>
              </thead>

              <tbody>
                {loadState.data.results.map((entry) => (
                  <tr
                    key={entry.date}
                    className="border-b border-[var(--color-border-soft)] last:border-b-0"
                  >
                    <td className="px-5 py-4 align-top text-sm text-foreground">
                      {entry.date}
                    </td>

                    <td className="px-5 py-4 text-right align-top text-sm text-muted-foreground">
                      {entry.sale_count}
                    </td>

                    <td className="px-5 py-4 text-right align-top text-sm font-semibold text-foreground">
                      {formatMoney(entry.total)} CRC
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
