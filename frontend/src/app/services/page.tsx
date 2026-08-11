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
import { SearchIcon, WrenchIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { canReadCustomers, canWriteCustomers } from "@/features/auth/permissions";
import { formatDate } from "@/features/inventory/purchases/format";
import { getServiceRecords } from "@/features/services/api";
import type { ServiceRecord, ServiceRecordFilters, ServiceStatus } from "@/features/services/types";
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
      data: PaginatedResponse<ServiceRecord>;
      message: null;
    }
  | {
      status: "forbidden" | "error";
      data: null;
      message: string;
    };

const INITIAL_FILTERS: ServiceRecordFilters = {
  query: "",
  status: "",
  activeState: "active",
  receivedFrom: "",
  receivedTo: "",
  page: 1,
  pageSize: 50,
};

const STATUS_LABELS: Record<ServiceStatus, string> = {
  RECEIVED: "Recibido",
  IN_PROGRESS: "En proceso",
  READY: "Listo",
  DELIVERED: "Entregado",
  CANCELLED: "Anulado",
};

const STATUS_BADGE_CLASSES: Record<ServiceStatus, string> = {
  RECEIVED: "bg-surface-muted text-muted-foreground",
  IN_PROGRESS: "bg-[var(--color-primary-soft)] text-[var(--color-brand-blue)]",
  READY: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  DELIVERED: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
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

  return "No fue posible consultar los servicios.";
}

export default function ServicesPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const searchInputRef = useRef<HTMLInputElement>(null);

  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  const [draftQuery, setDraftQuery] = useState("");

  const [filters, setFilters] = useState<ServiceRecordFilters>(INITIAL_FILTERS);

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    data: null,
    message: null,
  });

  const hasCustomersAccess = user ? canReadCustomers(user) : false;

  const hasWriteAccess = user ? canWriteCustomers(user) : false;

  useEffect(() => {
    if (authStatus !== "authenticated" || !token || !hasCustomersAccess) {
      return;
    }

    const controller = new AbortController();

    getServiceRecords(token, filters, controller.signal)
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
            message: "Este usuario no tiene permisos para consultar servicios.",
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
  }, [authStatus, filters, hasCustomersAccess, logout, router, token]);

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
      const data = await getServiceRecords(token, filters);

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
          message: "Este usuario no tiene permisos para consultar servicios.",
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
    updater: (current: ServiceRecordFilters) => ServiceRecordFilters,
  ): void {
    setLoadState({ status: "loading", data: null, message: null });

    setFilters(updater);
  }

  function openServiceRecord(serviceRecordId: number): void {
    router.push(`/services/${serviceRecordId}`);
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

      const serviceRecord =
        loadState.status === "success" ? loadState.data.results[rowIndex] : null;

      if (serviceRecord) {
        openServiceRecord(serviceRecord.id);
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

  if (authStatus === "authenticated" && user && !hasCustomersAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Este módulo requiere permisos de clientes."
      >
        <StatePanel
          title="No tiene acceso a servicios"
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
      title="Servicios"
      description="Bandeja operativa de servicios de inyectores."
      actions={
        hasWriteAccess ? (
          <Button
            type="button"
            onClick={() => {
              router.push("/services/new");
            }}
          >
            Recibir inyector
          </Button>
        ) : undefined
      }
    >
      <section
        className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]"
        aria-labelledby="services-list-title"
      >
        <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2
                id="services-list-title"
                className="text-lg font-semibold tracking-[-0.02em] text-foreground"
              >
                Servicios registrados
              </h2>

              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Busque por número de inyector o nombre del cliente.
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
                  placeholder="Número de inyector o cliente"
                  aria-label="Buscar servicios"
                  autoComplete="off"
                  spellCheck={false}
                />

                <span className="pointer-events-none absolute inset-y-0 right-4 hidden items-center text-xs font-semibold text-[var(--color-text-subtle)] sm:flex">
                  Tecla F
                </span>
              </div>

              <select
                value={filters.status}
                onChange={(event) => {
                  const status = event.target.value as ServiceRecordFilters["status"];

                  updateFilters((current) => ({ ...current, status, page: 1 }));
                }}
                className="h-12 rounded-[var(--radius-md)] border border-border bg-surface px-4 text-sm font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)]"
                aria-label="Filtrar servicios por estado"
              >
                <option value="">Todos los estados</option>
                <option value="RECEIVED">Recibido</option>
                <option value="IN_PROGRESS">En proceso</option>
                <option value="READY">Listo</option>
                <option value="DELIVERED">Entregado</option>
                <option value="CANCELLED">Anulado</option>
              </select>

              <Button type="submit">Buscar</Button>
            </form>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Recibido desde
              <Input
                type="date"
                value={filters.receivedFrom}
                onChange={(event) => {
                  const receivedFrom = event.target.value;

                  updateFilters((current) => ({ ...current, receivedFrom, page: 1 }));
                }}
                className="h-10 w-auto"
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              hasta
              <Input
                type="date"
                value={filters.receivedTo}
                onChange={(event) => {
                  const receivedTo = event.target.value;

                  updateFilters((current) => ({ ...current, receivedTo, page: 1 }));
                }}
                className="h-10 w-auto"
              />
            </label>

            {filters.query && (
              <div className="flex flex-wrap items-center gap-3">
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
        </div>

        {loadState.status === "loading" && (
          <LoadingState message="Consultando servicios…" />
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
              title="No se pudieron cargar los servicios"
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
              title={filters.query ? "No se encontraron servicios" : "No hay servicios registrados"}
              message={
                filters.query
                  ? "Revise el número de inyector o el nombre del cliente."
                  : "Todavía no se ha recibido ningún inyector para este filtro."
              }
              icon={<WrenchIcon />}
              action={
                filters.query ? (
                  <Button type="button" variant="secondary" onClick={handleClearSearch}>
                    Limpiar búsqueda
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}

        {loadState.status === "success" && loadState.data.results.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                    <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Inyector
                    </th>

                    <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Cliente
                    </th>

                    <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Recibido
                    </th>

                    <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Estado
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {loadState.data.results.map((serviceRecord, index) => (
                    <tr
                      key={serviceRecord.id}
                      ref={(element) => {
                        rowRefs.current[index] = element;
                      }}
                      tabIndex={0}
                      role="link"
                      aria-label={`Abrir servicio de ${serviceRecord.injector_detail.injector_number}`}
                      onClick={() => {
                        openServiceRecord(serviceRecord.id);
                      }}
                      onKeyDown={(event) => {
                        handleRowKeyDown(event, index);
                      }}
                      className="cursor-pointer border-b border-[var(--color-border-soft)] transition-colors last:border-b-0 hover:bg-[rgb(7_81_132_/_3%)] focus:bg-[var(--color-primary-soft)] focus:outline-none"
                    >
                      <td className="px-5 py-4 align-top">
                        <p className="font-mono font-semibold text-foreground">
                          {serviceRecord.injector_detail.injector_number}
                        </p>
                      </td>

                      <td className="px-5 py-4 align-top text-sm text-foreground">
                        {serviceRecord.injector_detail.customer_detail.display_name}
                      </td>

                      <td className="px-5 py-4 align-top text-sm text-muted-foreground">
                        {formatDate(serviceRecord.received_at)}
                      </td>

                      <td className="px-5 py-4 align-top">
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold",
                            STATUS_BADGE_CLASSES[serviceRecord.status],
                          ].join(" ")}
                        >
                          {STATUS_LABELS[serviceRecord.status]}
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
