"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { Pagination } from "@/components/data-display/pagination";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { CartIcon, SearchIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { canReadSales, canWriteSales } from "@/features/auth/permissions";
import { crcEquivalent, formatMoney } from "@/features/inventory/purchases/format";
import { getSales } from "@/features/sales/api";
import type { Sale, SaleFilters, SaleStatus } from "@/features/sales/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";
import type { PaginatedResponse } from "@/lib/api/types";

type LoadState =
  | {
      status: "loading";
      data: null;
      message: null;
    }
  | {
      status: "success";
      data: PaginatedResponse<Sale>;
      message: null;
    }
  | {
      status: "forbidden" | "error";
      data: null;
      message: string;
    };

const INITIAL_FILTERS: SaleFilters = {
  query: "",
  status: "",
  currency: "",
  dateFrom: "",
  dateTo: "",
  activeState: "active",
  page: 1,
  pageSize: 50,
};

const STATUS_LABELS: Record<SaleStatus, string> = {
  DRAFT: "Borrador",
  CONFIRMED: "Confirmada",
  CANCELLED: "Anulada",
};

const STATUS_BADGE_CLASSES: Record<SaleStatus, string> = {
  DRAFT: "bg-surface-muted text-muted-foreground",
  CONFIRMED: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  CANCELLED: "bg-[var(--color-danger-soft)] text-danger",
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

  return "No fue posible consultar las ventas.";
}

function saleCrcEquivalent(sale: Sale): string | null {
  if (sale.currency !== "USD") {
    return null;
  }

  return crcEquivalent(sale.total, sale.exchange_rate);
}

export default function SalesPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const searchInputRef = useRef<HTMLInputElement>(null);

  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  const [draftQuery, setDraftQuery] = useState("");

  const [filters, setFilters] = useState<SaleFilters>(INITIAL_FILTERS);

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    data: null,
    message: null,
  });

  const hasSalesAccess = user ? canReadSales(user) : false;

  const hasWriteAccess = user ? canWriteSales(user) : false;

  useEffect(() => {
    if (authStatus !== "authenticated" || !token || !hasSalesAccess) {
      return;
    }

    const controller = new AbortController();

    getSales(token, filters, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", data, message: null });
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
            data: null,
            message: "Este usuario no tiene permisos para consultar ventas.",
          });

          return;
        }

        setLoadState({
          status: "error",
          data: null,
          message: getLoadErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, filters, hasSalesAccess, logout, router, token]);

  useEffect(() => {
    function handleGlobalKeyboard(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;

      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable === true;

      if (
        event.key.toLowerCase() === "f" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !isTyping
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }

    globalThis.addEventListener("keydown", handleGlobalKeyboard);

    return () => {
      globalThis.removeEventListener("keydown", handleGlobalKeyboard);
    };
  }, []);

  async function handleRetry(): Promise<void> {
    if (!token) {
      return;
    }

    setLoadState({ status: "loading", data: null, message: null });

    try {
      const data = await getSales(token, filters);

      setLoadState({ status: "success", data, message: null });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setLoadState({
          status: "forbidden",
          data: null,
          message: "Este usuario no tiene permisos para consultar ventas.",
        });

        return;
      }

      setLoadState({
        status: "error",
        data: null,
        message: getLoadErrorMessage(error),
      });
    }
  }

  function updateFilters(
    updater: (current: SaleFilters) => SaleFilters,
  ): void {
    setLoadState({ status: "loading", data: null, message: null });

    setFilters(updater);
  }

  function openSale(saleId: number): void {
    router.push(`/sales/${saleId}`);
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    updateFilters((current) => ({
      ...current,
      query: draftQuery.trim(),
      page: 1,
    }));
  }

  function handleClearSearch(): void {
    setDraftQuery("");

    updateFilters((current) => ({
      ...current,
      query: "",
      page: 1,
    }));

    searchInputRef.current?.focus();
  }

  function handleRowKeyDown(
    event: ReactKeyboardEvent<HTMLTableRowElement>,
    rowIndex: number,
  ): void {
    if (event.key === "Enter") {
      event.preventDefault();

      const sale =
        loadState.status === "success" ? loadState.data.results[rowIndex] : null;

      if (sale) {
        openSale(sale.id);
      }

      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      rowRefs.current[rowIndex + 1]?.focus();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      rowRefs.current[rowIndex - 1]?.focus();
      return;
    }

    if (
      event.key === "PageDown" &&
      loadState.status === "success" &&
      loadState.data.next
    ) {
      event.preventDefault();

      updateFilters((current) => ({ ...current, page: current.page + 1 }));
      return;
    }

    if (
      event.key === "PageUp" &&
      loadState.status === "success" &&
      loadState.data.previous
    ) {
      event.preventDefault();

      updateFilters((current) => ({ ...current, page: current.page - 1 }));
    }
  }

  if (authStatus === "authenticated" && user && !hasSalesAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Este módulo requiere permisos de ventas."
      >
        <StatePanel
          title="No tiene acceso a ventas"
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
      title="Ventas"
      description="Consulte ventas registradas y su estado."
      actions={
        hasWriteAccess ? (
          <Button
            type="button"
            onClick={() => {
              router.push("/sales/new");
            }}
          >
            Nueva venta
          </Button>
        ) : undefined
      }
    >
      <section
        className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]"
        aria-labelledby="sales-list-title"
      >
        <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2
                id="sales-list-title"
                className="text-lg font-semibold tracking-[-0.02em] text-foreground"
              >
                Ventas registradas
              </h2>

              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Busque por nombre del cliente.
              </p>
            </div>

            <form
              className="flex w-full flex-col gap-3 sm:flex-row lg:max-w-3xl"
              onSubmit={handleSearchSubmit}
              role="search"
            >
              <div className="relative min-w-0 flex-1">
                <span
                  className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted-foreground"
                  aria-hidden="true"
                >
                  <SearchIcon />
                </span>

                <Input
                  ref={searchInputRef}
                  value={draftQuery}
                  onChange={(event) => {
                    setDraftQuery(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      handleClearSearch();
                    }
                  }}
                  className="pl-12 pr-24"
                  placeholder="Nombre del cliente"
                  aria-label="Buscar ventas"
                  autoComplete="off"
                  spellCheck={false}
                />

                <span className="pointer-events-none absolute inset-y-0 right-4 hidden items-center text-xs font-semibold text-[var(--color-text-subtle)] sm:flex">
                  Tecla F
                </span>
              </div>

              <Button type="submit">Buscar</Button>
            </form>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <select
              value={filters.status}
              onChange={(event) => {
                const status = event.target.value as SaleFilters["status"];

                updateFilters((current) => ({ ...current, status, page: 1 }));
              }}
              className="h-11 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)]"
              aria-label="Filtrar por estado"
            >
              <option value="">Todos los estados</option>
              <option value="DRAFT">Borrador</option>
              <option value="CONFIRMED">Confirmada</option>
              <option value="CANCELLED">Anulada</option>
            </select>

            <select
              value={filters.currency}
              onChange={(event) => {
                const currency = event.target.value as SaleFilters["currency"];

                updateFilters((current) => ({ ...current, currency, page: 1 }));
              }}
              className="h-11 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)]"
              aria-label="Filtrar por moneda"
            >
              <option value="">Todas las monedas</option>
              <option value="CRC">Colones (CRC)</option>
              <option value="USD">Dólares (USD)</option>
            </select>

            <select
              value={filters.activeState}
              onChange={(event) => {
                const activeState =
                  event.target.value as SaleFilters["activeState"];

                updateFilters((current) => ({ ...current, activeState, page: 1 }));
              }}
              className="h-11 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)]"
              aria-label="Filtrar ventas por estado activo"
            >
              <option value="active">Activas</option>
              <option value="inactive">Inactivas</option>
              <option value="all">Todas</option>
            </select>

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

          {filters.query && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">
                Resultados para{" "}
                <span className="font-semibold text-foreground">
                  &ldquo;{filters.query}&rdquo;
                </span>
              </p>

              <button
                type="button"
                onClick={handleClearSearch}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Limpiar búsqueda
              </button>
            </div>
          )}
        </div>

        {loadState.status === "loading" && (
          <LoadingState message="Consultando ventas…" />
        )}

        {loadState.status === "forbidden" && (
          <div className="p-6">
            <StatePanel
              title="Acceso restringido"
              message={loadState.message}
              tone="warning"
            />
          </div>
        )}

        {loadState.status === "error" && (
          <div className="p-6">
            <StatePanel
              title="No se pudieron cargar las ventas"
              message={loadState.message}
              tone="error"
              action={
                <Button
                  type="button"
                  onClick={() => {
                    void handleRetry();
                  }}
                >
                  Reintentar
                </Button>
              }
            />
          </div>
        )}

        {loadState.status === "success" && loadState.data.results.length === 0 && (
          <div className="p-6">
            <StatePanel
              title={filters.query ? "No se encontraron ventas" : "No hay ventas registradas"}
              message={
                filters.query
                  ? "Revise el nombre del cliente o intente sin filtros."
                  : "El sistema todavía no contiene ventas para el filtro seleccionado."
              }
              icon={<CartIcon />}
            />
          </div>
        )}

        {loadState.status === "success" && loadState.data.results.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                    <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Cliente
                    </th>

                    <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Fecha
                    </th>

                    <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Total
                    </th>

                    <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Estado
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {loadState.data.results.map((sale, index) => (
                    <tr
                      key={sale.id}
                      ref={(element) => {
                        rowRefs.current[index] = element;
                      }}
                      tabIndex={0}
                      role="link"
                      aria-label={`Abrir venta ${sale.id}`}
                      onClick={() => {
                        openSale(sale.id);
                      }}
                      onKeyDown={(event) => {
                        handleRowKeyDown(event, index);
                      }}
                      className="cursor-pointer border-b border-[var(--color-border-soft)] transition-colors last:border-b-0 hover:bg-[rgb(7_81_132_/_3%)] focus:bg-[var(--color-primary-soft)] focus:outline-none"
                    >
                      <td className="px-5 py-4 align-top">
                        <p className="font-semibold text-foreground">
                          {sale.customer_detail?.display_name ?? "Venta de mostrador"}
                        </p>
                      </td>

                      <td className="px-5 py-4 align-top text-sm text-muted-foreground">
                        {sale.sale_date}
                      </td>

                      <td className="px-5 py-4 align-top text-sm text-muted-foreground">
                        <p className="leading-tight">
                          {formatMoney(sale.total)} {sale.currency}
                        </p>

                        {saleCrcEquivalent(sale) && (
                          <p className="leading-tight text-xs text-[var(--color-text-subtle)]">
                            {saleCrcEquivalent(sale)}
                          </p>
                        )}
                      </td>

                      <td className="px-5 py-4 align-top">
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold",
                            STATUS_BADGE_CLASSES[sale.status],
                          ].join(" ")}
                        >
                          {STATUS_LABELS[sale.status]}
                        </span>
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
          </>
        )}
      </section>
    </AppShell>
  );
}
