"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Pagination } from "@/components/data-display/pagination";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { SearchIcon, TransferIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { canReadTransfers, canWriteTransfers } from "@/features/auth/permissions";
import { getStockTransfers } from "@/features/inventory/transfers/api";
import {
  formatDateOnly,
  STOCK_TRANSFER_STATUS_BADGE_CLASSES,
  STOCK_TRANSFER_STATUS_LABELS,
  type StockTransfer,
  type StockTransferFilters,
} from "@/features/inventory/transfers/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";
import type { PaginatedResponse } from "@/lib/api/types";

type LoadState =
  | { status: "loading" }
  | { status: "success"; data: PaginatedResponse<StockTransfer> }
  | { status: "error"; message: string };

const INITIAL_FILTERS: StockTransferFilters = {
  query: "",
  status: "",
  page: 1,
  pageSize: 50,
};

const HEADER_CLASSES =
  "px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground";

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

  return "No fue posible consultar los traslados.";
}

/**
 * Traslados a otra sede (punto 6 del plan del 2026-10-22). Solo el
 * Administrador.
 */
export default function StockTransfersPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [draftQuery, setDraftQuery] = useState("");

  const [filters, setFilters] = useState<StockTransferFilters>(INITIAL_FILTERS);

  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  const hasAccess = user ? canReadTransfers(user) : false;

  const hasWriteAccess = user ? canWriteTransfers(user) : false;

  useEffect(() => {
    if (authStatus !== "authenticated" || !token || !hasAccess) {
      return;
    }

    const controller = new AbortController();

    getStockTransfers(token, filters, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setLoadState({ status: "success", data });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          void logout().then(() => {
            router.replace("/login");
          });

          return;
        }

        setLoadState({ status: "error", message: getLoadErrorMessage(error) });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, filters, hasAccess, logout, router, token]);

  function updateFilters(updater: (current: StockTransferFilters) => StockTransferFilters): void {
    setLoadState({ status: "loading" });
    setFilters(updater);
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    updateFilters((current) => ({ ...current, query: draftQuery.trim(), page: 1 }));
  }

  if (authStatus === "authenticated" && user && !hasAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Los traslados a otra sede los hace el Administrador."
      >
        <StatePanel
          title="No tiene acceso a los traslados"
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
      title="Traslados"
      description="Mercadería que sale hacia otra sede. Al confirmar sale del inventario; al anular, vuelve."
      actions={
        hasWriteAccess ? (
          <Button
            type="button"
            onClick={() => {
              router.push("/inventory/transfers/new");
            }}
          >
            Nuevo traslado
          </Button>
        ) : undefined
      }
    >
      <section className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]">
        <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
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
                value={draftQuery}
                onChange={(event) => {
                  setDraftQuery(event.target.value);
                }}
                className="pl-12"
                placeholder="Número de traslado o producto"
                aria-label="Buscar traslados"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <select
              value={filters.status}
              onChange={(event) => {
                const status = event.target.value as StockTransferFilters["status"];

                updateFilters((current) => ({ ...current, status, page: 1 }));
              }}
              className="h-12 rounded-[var(--radius-md)] border border-border bg-surface px-4 text-sm font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)]"
              aria-label="Filtrar por estado"
            >
              <option value="">Todos los estados</option>
              <option value="DRAFT">Borrador</option>
              <option value="CONFIRMED">Confirmado</option>
              <option value="CANCELLED">Anulado</option>
            </select>

            <Button type="submit">Buscar</Button>
          </form>
        </div>

        {loadState.status === "loading" && <LoadingState message="Consultando traslados…" />}

        {loadState.status === "error" && (
          <div className="p-6">
            <StatePanel
              nested
              title="No se pudieron cargar los traslados"
              message={loadState.message}
              tone="error"
              action={
                <Button
                  type="button"
                  onClick={() => {
                    updateFilters((current) => ({ ...current }));
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
              nested
              title={filters.query || filters.status ? "No se encontraron traslados" : "Todavía no hay traslados"}
              message={
                filters.query || filters.status
                  ? "No hay traslados para los filtros indicados."
                  : "Un traslado registra la mercadería que sale hacia otra sede, con su guía en PDF."
              }
              icon={<TransferIcon />}
            />
          </div>
        )}

        {loadState.status === "success" && loadState.data.results.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                    <th className={HEADER_CLASSES}>Traslado</th>
                    <th className={HEADER_CLASSES}>Sede</th>
                    <th className={HEADER_CLASSES}>Fecha</th>
                    <th className={`${HEADER_CLASSES} text-right`}>Productos</th>
                    <th className={HEADER_CLASSES}>Estado</th>
                  </tr>
                </thead>

                <tbody>
                  {loadState.data.results.map((transfer) => (
                    <tr
                      key={transfer.id}
                      tabIndex={0}
                      role="link"
                      aria-label={`Abrir traslado ${transfer.id}`}
                      onClick={() => {
                        router.push(`/inventory/transfers/${transfer.id}`);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          router.push(`/inventory/transfers/${transfer.id}`);
                        }
                      }}
                      className="cursor-pointer border-b border-[var(--color-border-soft)] transition-colors last:border-b-0 hover:bg-[rgb(7_81_132_/_3%)] focus:bg-[var(--color-primary-soft)] focus:outline-none"
                    >
                      <td className="px-5 py-4 font-mono text-sm font-semibold text-foreground">
                        #{transfer.id}
                      </td>

                      <td className="px-5 py-4 text-sm font-semibold text-foreground">
                        {transfer.branch_detail.name}
                      </td>

                      <td className="px-5 py-4 text-sm text-muted-foreground">
                        {formatDateOnly(transfer.transfer_date)}
                      </td>

                      <td className="px-5 py-4 text-right text-sm text-muted-foreground">
                        {transfer.items.length}{" "}
                        {transfer.items.length === 1 ? "producto" : "productos"}
                        <span className="text-[var(--color-text-subtle)]">
                          {" "}
                          · {transfer.total_quantity} u.
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold",
                            STOCK_TRANSFER_STATUS_BADGE_CLASSES[transfer.status],
                          ].join(" ")}
                        >
                          {STOCK_TRANSFER_STATUS_LABELS[transfer.status]}
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
