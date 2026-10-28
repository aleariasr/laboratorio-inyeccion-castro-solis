"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { Pagination } from "@/components/data-display/pagination";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { SearchIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { formatWeekRange } from "@/features/cash/format";
import { canReadCash, canWriteCash } from "@/features/auth/permissions";
import { getCashClosings } from "@/features/cash/api";
import { PettyCashWeekCard } from "@/features/cash/petty-cash-week-card";
import type { CashClosing, CashClosingFilters } from "@/features/cash/types";
import { formatDate, formatMoney } from "@/features/inventory/purchases/format";
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
      data: PaginatedResponse<CashClosing>;
      message: null;
    }
  | {
      status: "forbidden" | "error";
      data: null;
      message: string;
    };

const INITIAL_FILTERS: CashClosingFilters = {
  query: "",
  dateFrom: "",
  dateTo: "",
  page: 1,
  pageSize: 20,
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

  return "No fue posible consultar los cierres de caja.";
}

export default function CashClosingsPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [filters, setFilters] = useState<CashClosingFilters>(INITIAL_FILTERS);

  // El buscador se escribe en draftQuery y se aplica al enviar, igual que en
  // el listado de compras: así no se dispara una consulta por cada tecla.
  const [draftQuery, setDraftQuery] = useState("");

  const searchInputRef = useRef<HTMLInputElement>(null);

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    data: null,
    message: null,
  });

  const hasCashAccess = user ? canReadCash(user) : false;

  const hasWriteAccess = user ? canWriteCash(user) : false;

  const handleUnauthorized = useCallback(() => {
    void logout().then(() => {
      router.replace("/login");
    });
  }, [logout, router]);

  const hasActiveFilters =
    Boolean(filters.query) || Boolean(filters.dateFrom) || Boolean(filters.dateTo);

  function updateFilters(
    updater: (current: CashClosingFilters) => CashClosingFilters,
  ): void {
    setLoadState({ status: "loading", data: null, message: null });

    setFilters(updater);
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    updateFilters((current) => ({
      ...current,
      query: draftQuery.trim(),
      page: 1,
    }));
  }

  function handleClearFilters(): void {
    setDraftQuery("");

    updateFilters((current) => ({
      ...current,
      query: "",
      dateFrom: "",
      dateTo: "",
      page: 1,
    }));

    searchInputRef.current?.focus();
  }

  useEffect(() => {
    if (authStatus !== "authenticated" || !token || !hasCashAccess) {
      return;
    }

    const controller = new AbortController();

    getCashClosings(token, filters, controller.signal)
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
            message: "Este usuario no tiene permisos para consultar caja.",
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
  }, [authStatus, hasCashAccess, filters, logout, router, token]);

  if (authStatus === "authenticated" && user && !hasCashAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Este módulo requiere permisos de caja."
      >
        <StatePanel
          title="No tiene acceso a caja"
          message="Los permisos de cada usuario los asigna el Administrador."
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
      title="Cierres de caja"
      description="Cierre semanal (sábado a viernes): efectivo esperado vs. contado."
      actions={
        hasWriteAccess ? (
          <Button
            type="button"
            onClick={() => {
              router.push("/cash/new");
            }}
          >
            Nuevo cierre
          </Button>
        ) : undefined
      }
    >
      {token && hasCashAccess && (
        <PettyCashWeekCard
          token={token}
          canWrite={hasWriteAccess}
          onUnauthorized={handleUnauthorized}
        />
      )}

      <div className="app-status-card mb-6 p-5 sm:p-6">
        <form
          className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-end"
          onSubmit={handleSearchSubmit}
          role="search"
        >
          <div className="min-w-0">
            <label
              htmlFor="cash-search"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground"
            >
              Buscar
            </label>

            <div className="relative">
              <span
                className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted-foreground"
                aria-hidden="true"
              >
                <SearchIcon />
              </span>

              <Input
                id="cash-search"
                ref={searchInputRef}
                value={draftQuery}
                onChange={(event) => {
                  setDraftQuery(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    handleClearFilters();
                  }
                }}
                className="pl-12"
                placeholder="Notas o motivo de la diferencia"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="sm:w-48">
            <label
              htmlFor="cash-date-from"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground"
            >
              Desde
            </label>

            <Input
              id="cash-date-from"
              type="date"
              value={filters.dateFrom}
              onChange={(event) => {
                const dateFrom = event.target.value;

                updateFilters((current) => ({ ...current, dateFrom, page: 1 }));
              }}
            />
          </div>

          <div className="sm:w-48">
            <label
              htmlFor="cash-date-to"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground"
            >
              Hasta
            </label>

            <Input
              id="cash-date-to"
              type="date"
              value={filters.dateTo}
              onChange={(event) => {
                const dateTo = event.target.value;

                updateFilters((current) => ({ ...current, dateTo, page: 1 }));
              }}
            />
          </div>

          <Button type="submit" variant="secondary" className="h-12">
            Buscar
          </Button>
        </form>

        <p className="mt-3 text-xs text-muted-foreground">
          El rango trae toda semana que se superponga con esas fechas.
        </p>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="mt-3 text-sm font-semibold text-primary hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {loadState.status === "loading" && (
        <LoadingState message="Consultando cierres de caja…" />
      )}

      {loadState.status === "forbidden" && (
        <StatePanel title="Acceso restringido" message={loadState.message} tone="warning" />
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudieron cargar los cierres"
          message={loadState.message}
          tone="error"
          action={
            <Button
              type="button"
              onClick={() => {
                globalThis.location.reload();
              }}
            >
              Reintentar
            </Button>
          }
        />
      )}

      {loadState.status === "success" &&
        loadState.data.results.length === 0 &&
        (hasActiveFilters ? (
          <StatePanel
            title="Ningún cierre coincide con el filtro"
            message="Ningún cierre coincide con las fechas o la palabra buscada."
            tone="neutral"
            action={
              <Button type="button" variant="secondary" onClick={handleClearFilters}>
                Limpiar filtros
              </Button>
            }
          />
        ) : (
          <StatePanel
            title="Todavía no hay cierres de caja"
            message="Cuando cierre la primera semana, va a aparecer acá."
            tone="neutral"
          />
        ))}

      {loadState.status === "success" && loadState.data.results.length > 0 && (
        <>
          <div className="app-status-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                    <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Semana
                    </th>

                    <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Debía haber
                    </th>

                    <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Contado
                    </th>

                    <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Diferencia
                    </th>

                    <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Impuestos
                    </th>

                    <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Cerrado
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {loadState.data.results.map((closing) => {
                    const differenceValue = Number(closing.difference);

                    return (
                      <tr
                        key={closing.id}
                        onClick={() => {
                          router.push(`/cash/${closing.id}`);
                        }}
                        className="cursor-pointer border-b border-[var(--color-border-soft)] transition-colors last:border-b-0 hover:bg-[rgb(7_81_132_/_3%)]"
                      >
                        <td className="px-5 py-4 align-top">
                          <span className="text-sm font-semibold text-foreground">
                            {formatWeekRange(closing.week_start, closing.week_end)}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-right align-top font-mono text-sm text-foreground">
                          ₡{formatMoney(closing.expected_physical_total)}
                        </td>

                        <td className="px-5 py-4 text-right align-top font-mono text-sm text-foreground">
                          ₡{formatMoney(closing.counted_total)}
                        </td>

                        <td
                          className={[
                            "px-5 py-4 text-right align-top font-mono text-sm font-semibold",
                            differenceValue === 0
                              ? "text-[var(--color-success)]"
                              : "text-[var(--color-danger)]",
                          ].join(" ")}
                        >
                          ₡{formatMoney(closing.difference)}
                        </td>

                        <td className="px-5 py-4 text-right align-top font-mono text-sm text-[var(--color-warning)]">
                          ₡{formatMoney(closing.expected_tax)}
                        </td>

                        <td className="px-5 py-4 align-top text-sm text-muted-foreground">
                          {formatDate(closing.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <Pagination
            page={filters.page}
            pageSize={filters.pageSize}
            totalItems={loadState.data.count}
            hasNextPage={loadState.data.next !== null}
            hasPreviousPage={loadState.data.previous !== null}
            onPageChange={(page) => {
              setFilters((current) => ({ ...current, page }));
            }}
          />
        </>
      )}
    </AppShell>
  );
}
