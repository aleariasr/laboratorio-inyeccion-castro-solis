"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Pagination } from "@/components/data-display/pagination";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { ArrowLeftIcon, ArrowsUpDownIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { canReadInventory } from "@/features/auth/permissions";
import {
  getStockMovements,
  getStockMovementsKardex,
} from "@/features/inventory/movements/api";
import {
  EMPTY_STOCK_MOVEMENT_FILTERS,
  MOVEMENT_DIRECTION_OPTIONS,
  STOCK_MOVEMENT_TYPE_OPTIONS,
  type StockMovement,
  type StockMovementFilters,
} from "@/features/inventory/movements/types";
import { getActiveLocations, getProducts } from "@/features/inventory/products/api";
import type { Product, StorageLocationSummary } from "@/features/inventory/products/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";
import type { PaginatedResponse } from "@/lib/api/types";

type KardexRow = StockMovement & { balanceAfter: number };

type ViewState =
  | { status: "loading" }
  | { status: "success"; mode: "list"; data: PaginatedResponse<StockMovement> }
  | { status: "success"; mode: "kardex"; rows: KardexRow[]; truncated: boolean }
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

const DIRECTION_BADGE_CLASSES: Record<"IN" | "OUT", string> = {
  IN: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  OUT: "bg-[var(--color-danger-soft)] text-danger",
};

const SELECT_CLASSES =
  "h-11 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)]";

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

  return "No fue posible consultar los movimientos.";
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Costa_Rica",
  }).format(date);
}

function formatSignedQuantity(movement: StockMovement): string {
  const prefix = movement.direction === "IN" ? "+" : "-";

  return `${prefix}${movement.quantity}`;
}

type MovementOrigin = { label: string; href: string | null };

function getMovementOrigin(movement: StockMovement): MovementOrigin {
  if (movement.purchase_id !== null) {
    const label = movement.purchase_invoice_number
      ? `Compra ${movement.purchase_invoice_number}`
      : `Compra #${movement.purchase_id}`;

    return { label, href: `/inventory/purchases/${movement.purchase_id}` };
  }

  if (movement.sale_id !== null) {
    return { label: `Venta #${movement.sale_id}`, href: `/sales/${movement.sale_id}` };
  }

  if (movement.inventory_count !== null) {
    const label = movement.inventory_count_reference
      ? `Conteo ${movement.inventory_count_reference}`
      : `Conteo #${movement.inventory_count}`;

    return { label, href: `/inventory/counts/${movement.inventory_count}` };
  }

  if (movement.reverses_movement !== null) {
    return { label: `Revierte #${movement.reverses_movement}`, href: null };
  }

  if (movement.movement_type === "INITIAL") {
    return { label: "Inventario inicial", href: null };
  }

  return { label: "Sin documento asociado", href: null };
}

export default function StockMovementsPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const productSearchInputRef = useRef<HTMLInputElement>(null);

  const [filters, setFilters] = useState<StockMovementFilters>(EMPTY_STOCK_MOVEMENT_FILTERS);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [productSearch, setProductSearch] = useState<ProductSearchState>(
    EMPTY_PRODUCT_SEARCH_STATE,
  );

  const [locations, setLocations] = useState<StorageLocationSummary[]>([]);

  const [viewState, setViewState] = useState<ViewState>({
    status: "loading",
  });

  const hasInventoryAccess = user ? canReadInventory(user) : false;

  const productId = filters.productId;

  const hasActiveFilters =
    selectedProduct !== null ||
    filters.locationId !== undefined ||
    filters.movementType !== "" ||
    filters.direction !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.ordering !== "-created_at";

  useEffect(() => {
    if (authStatus !== "authenticated" || !token || !hasInventoryAccess) {
      return;
    }

    const controller = new AbortController();

    getActiveLocations(token, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) {
          return;
        }

        setLocations(data);
      })
      .catch(() => {
        // El filtro de ubicación queda vacío si la consulta falla.
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasInventoryAccess, token]);

  useEffect(() => {
    if (!token || selectedProduct) {
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
  }, [productSearch.query, selectedProduct, token]);

  useEffect(() => {
    if (authStatus !== "authenticated" || !token || !hasInventoryAccess) {
      return;
    }

    const controller = new AbortController();

    if (productId !== undefined) {
      const kardexFilters = {
        productId,
        locationId: filters.locationId,
        movementType: filters.movementType,
        direction: filters.direction,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        purchaseId: filters.purchaseId,
        saleId: filters.saleId,
        inventoryCountId: filters.inventoryCountId,
      };

      getStockMovementsKardex(token, kardexFilters, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) {
            return;
          }

          let balance = 0;

          const ascendingRows: KardexRow[] = result.movements.map((movement) => {
            balance += movement.direction === "IN" ? movement.quantity : -movement.quantity;

            return { ...movement, balanceAfter: balance };
          });

          const rows =
            filters.ordering === "-created_at" ? [...ascendingRows].reverse() : ascendingRows;

          setViewState({ status: "success", mode: "kardex", rows, truncated: result.truncated });
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
            setViewState({
              status: "forbidden",
              message: "Este usuario no tiene permisos para consultar movimientos.",
            });

            return;
          }

          setViewState({ status: "error", message: getLoadErrorMessage(error) });
        });

      return () => {
        controller.abort();
      };
    }

    getStockMovements(token, filters, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) {
          return;
        }

        setViewState({ status: "success", mode: "list", data });
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
          setViewState({
            status: "forbidden",
            message: "Este usuario no tiene permisos para consultar movimientos.",
          });

          return;
        }

        setViewState({ status: "error", message: getLoadErrorMessage(error) });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, filters, hasInventoryAccess, logout, productId, router, token]);

  function updateFilters(
    updater: (current: StockMovementFilters) => StockMovementFilters,
  ): void {
    setViewState({ status: "loading" });
    setFilters(updater);
  }

  function selectProduct(product: Product): void {
    setSelectedProduct(product);
    setProductSearch(EMPTY_PRODUCT_SEARCH_STATE);
    updateFilters((current) => ({ ...current, productId: product.id, page: 1 }));
  }

  function clearProductFilter(): void {
    setSelectedProduct(null);
    setProductSearch(EMPTY_PRODUCT_SEARCH_STATE);
    updateFilters((current) => ({ ...current, productId: undefined, page: 1 }));
    productSearchInputRef.current?.focus();
  }

  function handleClearFilters(): void {
    setSelectedProduct(null);
    setProductSearch(EMPTY_PRODUCT_SEARCH_STATE);
    setViewState({ status: "loading" });
    setFilters(EMPTY_STOCK_MOVEMENT_FILTERS);
  }

  function goBack(): void {
    router.back();
  }

  if (authStatus === "authenticated" && user && !hasInventoryAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Este módulo requiere permisos de inventario."
      >
        <StatePanel
          title="No tiene acceso a movimientos de inventario"
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
      title="Movimientos de inventario"
      description="Consulte el historial de entradas, salidas y ajustes de existencias."
      actions={
        <Button type="button" variant="secondary" onClick={goBack}>
          <ArrowLeftIcon />
          Volver
        </Button>
      }
    >
      <section
        className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]"
        aria-labelledby="stock-movements-title"
      >
        <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
          <div>
            <h2
              id="stock-movements-title"
              className="text-lg font-semibold tracking-[-0.02em] text-foreground"
            >
              Historial de movimientos
            </h2>

            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Filtre por un producto para ver su saldo corriente (kardex).
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="w-72">
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
                    aria-label="Filtrar por producto"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-11"
                  />

                  {productSearch.isListOpen && productSearch.query.trim().length >= 2 && (
                    <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-md)]">
                      {productSearch.searchError && (
                        <p className="px-4 py-3 text-sm text-[var(--color-danger)]">
                          {productSearch.searchError}
                        </p>
                      )}

                      {!productSearch.searchError && productSearch.results.length === 0 && (
                        <p className="px-4 py-3 text-sm text-muted-foreground">Sin resultados.</p>
                      )}

                      {!productSearch.searchError && productSearch.results.length > 0 && (
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

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Ubicación
              </label>

              <select
                value={filters.locationId ?? ""}
                onChange={(event) => {
                  const value = event.target.value;

                  updateFilters((current) => ({
                    ...current,
                    locationId: value ? Number(value) : undefined,
                    page: 1,
                  }));
                }}
                className={SELECT_CLASSES}
                aria-label="Filtrar por ubicación"
              >
                <option value="">Todas las ubicaciones</option>

                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Tipo
              </label>

              <select
                value={filters.movementType}
                onChange={(event) => {
                  const movementType = event.target.value as StockMovementFilters["movementType"];

                  updateFilters((current) => ({ ...current, movementType, page: 1 }));
                }}
                className={SELECT_CLASSES}
                aria-label="Filtrar por tipo de movimiento"
              >
                <option value="">Todos los tipos</option>

                {STOCK_MOVEMENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Dirección
              </label>

              <select
                value={filters.direction}
                onChange={(event) => {
                  const direction = event.target.value as StockMovementFilters["direction"];

                  updateFilters((current) => ({ ...current, direction, page: 1 }));
                }}
                className={SELECT_CLASSES}
                aria-label="Filtrar por dirección"
              >
                <option value="">Entradas y salidas</option>

                {MOVEMENT_DIRECTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Desde
              </label>

              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(event) => {
                  const dateFrom = event.target.value;

                  updateFilters((current) => ({ ...current, dateFrom, page: 1 }));
                }}
                className="h-11 w-auto"
                aria-label="Fecha inicial"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Hasta
              </label>

              <Input
                type="date"
                value={filters.dateTo}
                onChange={(event) => {
                  const dateTo = event.target.value;

                  updateFilters((current) => ({ ...current, dateTo, page: 1 }));
                }}
                className="h-11 w-auto"
                aria-label="Fecha final"
              />
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                updateFilters((current) => ({
                  ...current,
                  ordering: current.ordering === "-created_at" ? "created_at" : "-created_at",
                  page: 1,
                }));
              }}
            >
              {filters.ordering === "-created_at" ? "Más recientes primero" : "Más antiguos primero"}
            </Button>

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

        {viewState.status === "loading" && <LoadingState message="Consultando movimientos…" />}

        {viewState.status === "forbidden" && (
          <div className="p-6">
            <StatePanel title="Acceso restringido" message={viewState.message} tone="warning" />
          </div>
        )}

        {viewState.status === "error" && (
          <div className="p-6">
            <StatePanel
              title="No se pudieron cargar los movimientos"
              message={viewState.message}
              tone="error"
              action={
                <Button
                  type="button"
                  onClick={() => {
                    setViewState({ status: "loading" });
                    setFilters((current) => ({ ...current }));
                  }}
                >
                  Reintentar
                </Button>
              }
            />
          </div>
        )}

        {viewState.status === "success" &&
          viewState.mode === "kardex" &&
          viewState.rows.length === 0 && (
            <div className="p-6">
              <StatePanel
                title="Sin movimientos"
                message="Este producto todavía no tiene movimientos registrados para el filtro seleccionado."
                icon={<ArrowsUpDownIcon />}
              />
            </div>
          )}

        {viewState.status === "success" &&
          viewState.mode === "list" &&
          viewState.data.results.length === 0 && (
            <div className="p-6">
              <StatePanel
                title="No hay movimientos"
                message="No se encontraron movimientos para los filtros seleccionados."
                icon={<ArrowsUpDownIcon />}
              />
            </div>
          )}

        {viewState.status === "success" && viewState.mode === "kardex" && viewState.truncated && (
          <div className="border-b border-[var(--color-border-soft)] bg-[var(--color-warning-soft)] px-5 py-3 text-sm text-[var(--color-warning)]">
            Se alcanzó el límite de 2000 movimientos mostrados. Use el rango de fechas para acotar
            la consulta.
          </div>
        )}

        {viewState.status === "success" && viewState.mode === "kardex" && viewState.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Fecha
                  </th>

                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Tipo
                  </th>

                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Cantidad
                  </th>

                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Saldo
                  </th>

                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Origen
                  </th>

                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Usuario
                  </th>
                </tr>
              </thead>

              <tbody>
                {viewState.rows.map((movement) => {
                  const origin = getMovementOrigin(movement);

                  return (
                    <tr
                      key={movement.id}
                      className="border-b border-[var(--color-border-soft)] last:border-b-0"
                    >
                      <td className="px-5 py-4 align-top text-sm text-muted-foreground">
                        {formatDateTime(movement.created_at)}
                      </td>

                      <td className="px-5 py-4 align-top">
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold",
                            DIRECTION_BADGE_CLASSES[movement.direction],
                          ].join(" ")}
                        >
                          {movement.movement_type_display}
                        </span>
                      </td>

                      <td className="px-5 py-4 align-top text-sm font-semibold text-foreground">
                        {formatSignedQuantity(movement)}
                      </td>

                      <td className="px-5 py-4 align-top text-sm font-semibold text-foreground">
                        {movement.balanceAfter}
                      </td>

                      <td className="px-5 py-4 align-top text-sm">
                        {origin.href ? (
                          <Link href={origin.href} className="font-medium text-primary hover:underline">
                            {origin.label}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">{origin.label}</span>
                        )}
                      </td>

                      <td className="px-5 py-4 align-top text-sm text-muted-foreground">
                        {movement.created_by_username ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {viewState.status === "success" &&
          viewState.mode === "list" &&
          viewState.data.results.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Fecha
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Producto
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Tipo
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Cantidad
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Origen
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Usuario
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {viewState.data.results.map((movement) => {
                      const origin = getMovementOrigin(movement);

                      return (
                        <tr
                          key={movement.id}
                          className="border-b border-[var(--color-border-soft)] last:border-b-0"
                        >
                          <td className="px-5 py-4 align-top text-sm text-muted-foreground">
                            {formatDateTime(movement.created_at)}
                          </td>

                          <td className="px-5 py-4 align-top text-sm">
                            <Link
                              href={`/inventory/products/${movement.product}`}
                              className="font-medium text-primary hover:underline"
                            >
                              <span className="font-mono">{movement.product_detail.standard_code}</span>
                              <span className="ml-2">{movement.product_detail.name}</span>
                            </Link>
                          </td>

                          <td className="px-5 py-4 align-top">
                            <span
                              className={[
                                "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold",
                                DIRECTION_BADGE_CLASSES[movement.direction],
                              ].join(" ")}
                            >
                              {movement.movement_type_display}
                            </span>
                          </td>

                          <td className="px-5 py-4 align-top text-sm font-semibold text-foreground">
                            {formatSignedQuantity(movement)}
                          </td>

                          <td className="px-5 py-4 align-top text-sm">
                            {origin.href ? (
                              <Link
                                href={origin.href}
                                className="font-medium text-primary hover:underline"
                              >
                                {origin.label}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">{origin.label}</span>
                            )}
                          </td>

                          <td className="px-5 py-4 align-top text-sm text-muted-foreground">
                            {movement.created_by_username ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={filters.page}
                pageSize={filters.pageSize}
                totalItems={viewState.data.count}
                hasNextPage={viewState.data.next !== null}
                hasPreviousPage={viewState.data.previous !== null}
                onPageChange={(page) => {
                  updateFilters((current) => ({ ...current, page }));
                }}
              />
            </>
          )}
      </section>
    </AppShell>
  );
}
