"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Pagination } from "@/components/data-display/pagination";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { ArrowLeftIcon, WrenchIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { canPriceServices } from "@/features/auth/permissions";
import { formatMoney } from "@/features/inventory/purchases/format";
import { getServiceTypesPage } from "@/features/services/api";
import {
  EMPTY_SERVICE_TYPE_FILTERS,
  type ServiceTypeDetail,
  type ServiceTypeFilters,
} from "@/features/services/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";
import type { PaginatedResponse } from "@/lib/api/types";

type LoadState =
  | { status: "loading" }
  | { status: "success"; data: PaginatedResponse<ServiceTypeDetail> }
  | { status: "error"; message: string };

const HEADER_CLASSES =
  "px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground";

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

  return "No fue posible consultar los tipos de servicio.";
}

/**
 * Catálogo de tipos de servicio (punto 1A del plan del 2026-10-22): con su
 * precio de mano de obra y su kit. Solo el Administrador, que es quien
 * define precios de servicios (punto 25).
 */
export default function ServiceTypesPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [filters, setFilters] = useState<ServiceTypeFilters>(EMPTY_SERVICE_TYPE_FILTERS);

  const [draftQuery, setDraftQuery] = useState("");

  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  const hasAccess = user ? canPriceServices(user) : false;

  useEffect(() => {
    if (authStatus !== "authenticated" || !token || !hasAccess) {
      return;
    }

    const controller = new AbortController();

    getServiceTypesPage(token, filters, controller.signal)
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

        setLoadState({ status: "error", message: getLoadErrorMessage(error) });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, filters, hasAccess, logout, router, token]);

  function updateFilters(updater: (current: ServiceTypeFilters) => ServiceTypeFilters): void {
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
        description="Los tipos de servicio y sus precios los administra el Administrador."
      >
        <StatePanel
          title="No tiene acceso a los tipos de servicio"
          message="Solicite a una persona administradora que revise los permisos de su usuario."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/services");
              }}
            >
              Volver a servicios
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Tipos de servicio"
      description="Lo que se cobra en un servicio: precio de mano de obra, qué incluye y los accesorios que suele llevar."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              router.back();
            }}
          >
            <ArrowLeftIcon />
            Volver
          </Button>

          <Button
            type="button"
            onClick={() => {
              router.push("/services/types/new");
            }}
          >
            Nuevo tipo de servicio
          </Button>
        </div>
      }
    >
      <section className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]">
        <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={handleSearchSubmit}
          >
            <div className="w-full sm:max-w-sm">
              <label
                htmlFor="service-types-query"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground"
              >
                Buscar
              </label>

              <Input
                id="service-types-query"
                value={draftQuery}
                onChange={(event) => {
                  setDraftQuery(event.target.value);
                }}
                placeholder="Nombre o descripción"
                autoComplete="off"
                className="h-11"
              />
            </div>

            <div>
              <label
                htmlFor="service-types-state"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground"
              >
                Estado
              </label>

              <select
                id="service-types-state"
                value={filters.activeState}
                onChange={(event) => {
                  const activeState = event.target.value as ServiceTypeFilters["activeState"];

                  updateFilters((current) => ({ ...current, activeState, page: 1 }));
                }}
                className={SELECT_CLASSES}
              >
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
                <option value="all">Todos</option>
              </select>
            </div>

            <Button type="submit" variant="secondary">
              Buscar
            </Button>
          </form>
        </div>

        {loadState.status === "loading" && <LoadingState message="Consultando tipos de servicio…" />}

        {loadState.status === "error" && (
          <div className="p-6">
            <StatePanel
              title="No se pudieron cargar los tipos de servicio"
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
              title="Sin tipos de servicio"
              message={
                filters.query || filters.activeState !== "active"
                  ? "No hay tipos de servicio para los filtros seleccionados."
                  : "Todavía no hay tipos de servicio. Cada uno puede tener su precio de mano de obra y su kit de accesorios."
              }
              icon={<WrenchIcon />}
            />
          </div>
        )}

        {loadState.status === "success" && loadState.data.results.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                    <th className={HEADER_CLASSES}>Tipo de servicio</th>
                    <th className={`${HEADER_CLASSES} text-right`}>Mano de obra</th>
                    <th className={HEADER_CLASSES}>Accesorios que suele llevar</th>
                    <th className={HEADER_CLASSES}>Estado</th>
                  </tr>
                </thead>

                <tbody>
                  {loadState.data.results.map((serviceType) => (
                    <tr
                      key={serviceType.id}
                      tabIndex={0}
                      onClick={() => {
                        router.push(`/services/types/${serviceType.id}/edit`);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          router.push(`/services/types/${serviceType.id}/edit`);
                        }
                      }}
                      aria-label={`Editar ${serviceType.name}`}
                      className="cursor-pointer border-b border-[var(--color-border-soft)] last:border-b-0 hover:bg-surface-muted/50 focus:bg-surface-muted/50 focus:outline-none"
                    >
                      <td className="px-5 py-4 align-top">
                        <p className="font-semibold text-foreground">{serviceType.name}</p>

                        {serviceType.description && (
                          <p className="mt-1 line-clamp-2 max-w-lg text-sm leading-5 text-muted-foreground">
                            {serviceType.description}
                          </p>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right align-top font-mono text-sm font-semibold text-foreground">
                        {serviceType.default_labor_price
                          ? `₡${formatMoney(serviceType.default_labor_price)}`
                          : <span className="font-sans font-normal text-muted-foreground">Sin precio</span>}
                      </td>

                      <td className="px-5 py-4 align-top text-sm text-muted-foreground">
                        {serviceType.kit_items.length === 0
                          ? "—"
                          : serviceType.kit_items
                              .map((item) => `${item.product_detail.name} × ${item.quantity}`)
                              .join(", ")}
                      </td>

                      <td className="px-5 py-4 align-top">
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                            serviceType.is_active
                              ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                              : "bg-surface-muted text-muted-foreground",
                          ].join(" ")}
                        >
                          {serviceType.is_active ? "Activo" : "Inactivo"}
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
