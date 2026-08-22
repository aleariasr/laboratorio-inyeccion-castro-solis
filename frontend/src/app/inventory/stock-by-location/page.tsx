"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Pagination } from "@/components/data-display/pagination";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { ArrowLeftIcon, LayersIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { canReadReports } from "@/features/auth/permissions";
import { getStorageLocations } from "@/features/inventory/locations/api";
import { getStockByLocationReport } from "@/features/inventory/reports/api";
import {
  EMPTY_STOCK_BY_LOCATION_FILTERS,
  type StockByLocationFilters,
  type StockByLocationReport,
} from "@/features/inventory/reports/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | { status: "loading" }
  | { status: "success"; data: StockByLocationReport }
  | { status: "forbidden" | "error"; message: string };

type LocationLookupState =
  | { status: "idle"; message: null }
  | { status: "loading"; message: null }
  | { status: "error"; message: string };

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

  return "No fue posible consultar el stock por ubicación.";
}

function isLowStock(product: { current_stock: number; minimum_stock: number }): boolean {
  return product.current_stock <= product.minimum_stock;
}

export default function StockByLocationPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [reloadKey, setReloadKey] = useState(0);

  const [draftQuery, setDraftQuery] = useState("");
  const [draftLocationCode, setDraftLocationCode] = useState("");
  const [appliedLocationCode, setAppliedLocationCode] = useState<string | null>(null);

  const [filters, setFilters] = useState<StockByLocationFilters>(EMPTY_STOCK_BY_LOCATION_FILTERS);

  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  const [locationLookupState, setLocationLookupState] = useState<LocationLookupState>({
    status: "idle",
    message: null,
  });

  const hasInventoryAccess = user ? canReadReports(user) : false;

  const hasActiveFilters = filters.q !== "" || filters.location !== null;

  useEffect(() => {
    if (authStatus !== "authenticated" || !token || !hasInventoryAccess) {
      return;
    }

    const controller = new AbortController();

    getStockByLocationReport(token, filters, controller.signal)
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
            message: "Este usuario no tiene permisos para consultar reportes de inventario.",
          });

          return;
        }

        setLoadState({ status: "error", message: getLoadErrorMessage(error) });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, filters, hasInventoryAccess, logout, reloadKey, router, token]);

  function updateFilters(
    updater: (current: StockByLocationFilters) => StockByLocationFilters,
  ): void {
    setLoadState({ status: "loading" });
    setFilters(updater);
  }

  function handleRetry(): void {
    setLoadState({ status: "loading" });
    setReloadKey((current) => current + 1);
  }

  async function handleFiltersSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const normalizedCode = draftLocationCode.trim().toUpperCase();

    if (!normalizedCode) {
      setLocationLookupState({ status: "idle", message: null });
      setAppliedLocationCode(null);

      updateFilters((current) => ({
        ...current,
        location: null,
        q: draftQuery.trim(),
        page: 1,
      }));

      return;
    }

    if (!token) {
      return;
    }

    setLocationLookupState({ status: "loading", message: null });

    try {
      const matches = await getStorageLocations(token, {
        query: normalizedCode,
        activeState: "all",
        page: 1,
        pageSize: 10,
      });

      const exactMatch = matches.results.find(
        (location) => location.code === normalizedCode,
      );

      if (!exactMatch) {
        setLocationLookupState({
          status: "error",
          message: `No se encontró la ubicación "${normalizedCode}".`,
        });

        return;
      }

      setLocationLookupState({ status: "idle", message: null });
      setAppliedLocationCode(exactMatch.code);

      updateFilters((current) => ({
        ...current,
        location: exactMatch.id,
        q: draftQuery.trim(),
        page: 1,
      }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      setLocationLookupState({
        status: "error",
        message: getLoadErrorMessage(error),
      });
    }
  }

  function handleClearFilters(): void {
    setDraftQuery("");
    setDraftLocationCode("");
    setAppliedLocationCode(null);
    setLocationLookupState({ status: "idle", message: null });

    updateFilters(() => EMPTY_STOCK_BY_LOCATION_FILTERS);
  }

  function goBack(): void {
    router.back();
  }

  if (authStatus === "authenticated" && user && !hasInventoryAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Este módulo requiere permisos de reportes."
      >
        <StatePanel
          title="No tiene acceso a reportes de inventario"
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
      title="Stock por ubicación"
      description="Existencias actuales agrupadas por ubicación de almacenamiento."
      actions={
        <Button type="button" variant="secondary" onClick={goBack}>
          <ArrowLeftIcon />
          Volver
        </Button>
      }
    >
      <div className="mb-5 rounded-[var(--radius-xl)] bg-surface p-5 shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)] sm:p-6">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            void handleFiltersSubmit(event);
          }}
        >
          <div className="min-w-0 flex-1">
            <label
              htmlFor="stock-by-location-q"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground"
            >
              Producto
            </label>

            <Input
              id="stock-by-location-q"
              value={draftQuery}
              onChange={(event) => {
                setDraftQuery(event.target.value);
              }}
              placeholder="Código, nombre o descripción"
              autoComplete="off"
            />
          </div>

          <div className="sm:w-48">
            <label
              htmlFor="stock-by-location-code"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground"
            >
              Ubicación exacta
            </label>

            <Input
              id="stock-by-location-code"
              value={draftLocationCode}
              onChange={(event) => {
                setDraftLocationCode(event.target.value);
              }}
              placeholder="Ej. B200"
              autoComplete="off"
            />
          </div>

          <Button type="submit" disabled={locationLookupState.status === "loading"}>
            {locationLookupState.status === "loading" ? "Buscando…" : "Buscar"}
          </Button>
        </form>

        {locationLookupState.status === "error" && (
          <p className="mt-3 text-sm font-medium text-danger">{locationLookupState.message}</p>
        )}

        {hasActiveFilters && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Filtros activos:{" "}
              {appliedLocationCode && (
                <span className="font-semibold text-foreground">
                  Ubicación {appliedLocationCode}
                </span>
              )}
              {appliedLocationCode && filters.q && " · "}
              {filters.q && (
                <span className="font-semibold text-foreground">“{filters.q}”</span>
              )}
            </p>

            <button
              type="button"
              onClick={handleClearFilters}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {loadState.status === "loading" && (
        <div className="rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]">
          <LoadingState message="Consultando existencias…" />
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
          title={hasActiveFilters ? "Sin resultados para estos filtros" : "Sin ubicaciones registradas"}
          message={
            hasActiveFilters
              ? "Revise el código de producto o la ubicación indicada."
              : "El sistema todavía no tiene ubicaciones de almacenamiento con productos."
          }
          icon={<LayersIcon />}
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
        <>
          <div className="flex flex-col gap-5">
            {loadState.data.results.map((location) => (
              <section
                key={location.id}
                className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]"
                aria-labelledby={`location-${location.id}-title`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-soft)] p-5 sm:p-6">
                  <div>
                    <h2
                      id={`location-${location.id}-title`}
                      className="text-lg font-semibold tracking-[-0.02em] text-foreground"
                    >
                      <Link href={`/inventory/locations/${location.id}`} className="hover:underline">
                        {location.code}
                      </Link>
                    </h2>

                    {location.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{location.description}</p>
                    )}
                  </div>

                  <span className="inline-flex items-center rounded-full bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground">
                    Total: {location.total_stock}
                  </span>
                </div>

                {location.products.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">
                    Sin productos registrados en esta ubicación.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                          <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Producto
                          </th>

                          <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Stock actual
                          </th>

                          <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Mínimo
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {location.products.map((product) => (
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
                              <span
                                className={[
                                  "font-semibold",
                                  isLowStock(product) ? "text-danger" : "text-foreground",
                                ].join(" ")}
                              >
                                {product.current_stock}
                              </span>

                              {isLowStock(product) && (
                                <span className="ml-2 inline-flex items-center rounded-full bg-[var(--color-danger-soft)] px-2.5 py-1 text-xs font-semibold text-danger">
                                  Stock bajo
                                </span>
                              )}
                            </td>

                            <td className="px-5 py-4 align-top text-sm text-muted-foreground">
                              {product.minimum_stock}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
          </div>

          <div className="mt-5 overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]">
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
        </>
      )}
    </AppShell>
  );
}
