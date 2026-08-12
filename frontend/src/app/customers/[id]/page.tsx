"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { ArrowLeftIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canReadCustomers, canWriteCustomers } from "@/features/auth/permissions";
import { formatDate, formatMoney } from "@/features/inventory/purchases/format";
import { getCustomer, getCustomerInjectors } from "@/features/customers/api";
import type { Customer, CustomerInjector } from "@/features/customers/types";
import { getSales } from "@/features/sales/api";
import type { Sale } from "@/features/sales/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      customer: null;
      injectors: [];
      sales: [];
      message: null;
    }
  | {
      status: "success";
      customer: Customer;
      injectors: CustomerInjector[];
      sales: Sale[];
      message: null;
    }
  | {
      status: "not-found" | "forbidden" | "error";
      customer: null;
      injectors: [];
      sales: [];
      message: string;
    };

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  PERSON: "Persona",
  COMPANY: "Empresa",
};

const SALE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  CONFIRMED: "Confirmada",
  CANCELLED: "Anulada",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La consulta tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible consultar el cliente.";
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    customer: null,
    injectors: [],
    sales: [],
    message: null,
  });

  const customerId = Number(params.id);

  const hasCustomersAccess = user ? canReadCustomers(user) : false;

  const hasWriteAccess = user ? canWriteCustomers(user) : false;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasCustomersAccess ||
      !Number.isInteger(customerId) ||
      customerId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    Promise.all([
      getCustomer(token, customerId, controller.signal),
      getCustomerInjectors(token, customerId, controller.signal),
      getSales(
        token,
        {
          query: "",
          customerId,
          status: "",
          dateFrom: "",
          dateTo: "",
          activeState: "all",
          page: 1,
          pageSize: 10,
        },
        controller.signal,
      ).then((response) => response.results),
    ])
      .then(([customer, injectors, sales]) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", customer, injectors, sales, message: null });
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
            customer: null,
            injectors: [],
            sales: [],
            message: "Este usuario no tiene permisos para consultar clientes.",
          });

          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setLoadState({
            status: "not-found",
            customer: null,
            injectors: [],
            sales: [],
            message: "El cliente solicitado no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          customer: null,
          injectors: [],
          sales: [],
          message: getErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, customerId, hasCustomersAccess, logout, router, token]);

  function goBack(): void {
    router.back();
  }

  if (!Number.isInteger(customerId) || customerId <= 0) {
    return (
      <AppShell
        title="Cliente no válido"
        description="La dirección proporcionada no identifica un cliente."
      >
        <StatePanel
          title="Identificador incorrecto"
          message="Regrese al listado y seleccione un cliente válido."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/customers");
              }}
            >
              Volver a clientes
            </Button>
          }
        />
      </AppShell>
    );
  }

  if (authStatus === "authenticated" && user && !hasCustomersAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Este módulo requiere permisos de clientes."
      >
        <StatePanel
          title="No tiene acceso al cliente"
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
      title={
        loadState.status === "success" ? loadState.customer.display_name : "Detalle de cliente"
      }
      description={
        loadState.status === "success"
          ? CUSTOMER_TYPE_LABELS[loadState.customer.customer_type] ?? loadState.customer.customer_type
          : "Información registrada del cliente."
      }
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {loadState.status === "success" && hasWriteAccess && (
            <Button
              type="button"
              onClick={() => {
                router.push(`/customers/${loadState.customer.id}/edit`);
              }}
            >
              Editar cliente
            </Button>
          )}

          <Button type="button" variant="secondary" onClick={goBack}>
            <ArrowLeftIcon />
            Volver
          </Button>
        </div>
      }
    >
      {loadState.status === "loading" && <LoadingState message="Consultando cliente…" />}

      {loadState.status === "forbidden" && (
        <StatePanel title="Acceso restringido" message={loadState.message} tone="warning" />
      )}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Cliente no encontrado"
          message={loadState.message}
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/customers");
              }}
            >
              Volver al catálogo
            </Button>
          }
        />
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar el cliente"
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

      {loadState.status === "success" && (
        <div className="grid gap-6">
          <section className="app-status-card overflow-hidden">
            <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.025em] text-foreground">
                  {loadState.customer.display_name}
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {loadState.customer.notes || "Sin notas registradas."}
                </p>
              </div>

              <span
                className={[
                  "inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                  loadState.customer.is_active
                    ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                    : "bg-surface-muted text-muted-foreground",
                ].join(" ")}
              >
                <span
                  className={[
                    "size-1.5 rounded-full",
                    loadState.customer.is_active
                      ? "bg-[var(--color-success)]"
                      : "bg-[var(--color-text-subtle)]",
                  ].join(" ")}
                  aria-hidden="true"
                />

                {loadState.customer.is_active ? "Activo" : "Inactivo"}
              </span>
            </div>

            <dl className="border-t border-[var(--color-border-soft)]">
              <div className="app-status-row">
                <dt>Tipo</dt>
                <dd>
                  {CUSTOMER_TYPE_LABELS[loadState.customer.customer_type] ??
                    loadState.customer.customer_type}
                </dd>
              </div>

              <div className="app-status-row">
                <dt>Identificación</dt>
                <dd>{loadState.customer.identification || "Sin identificación registrada"}</dd>
              </div>

              <div className="app-status-row">
                <dt>Teléfono</dt>
                <dd>{loadState.customer.phone || "Sin teléfono registrado"}</dd>
              </div>

              <div className="app-status-row">
                <dt>Correo electrónico</dt>
                <dd>{loadState.customer.email || "Sin correo registrado"}</dd>
              </div>

              <div className="app-status-row">
                <dt>Fecha de creación</dt>
                <dd>{formatDate(loadState.customer.created_at)}</dd>
              </div>

              <div className="app-status-row">
                <dt>Última modificación</dt>
                <dd>{formatDate(loadState.customer.updated_at)}</dd>
              </div>
            </dl>
          </section>

          <section className="app-status-card overflow-hidden">
            <div className="border-b border-[var(--color-border-soft)] p-6">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                Inyectores registrados
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                La gestión de inyectores y servicios se implementará en una fase posterior.
              </p>
            </div>

            {loadState.injectors.length === 0 ? (
              <div className="p-6">
                <p className="text-sm text-muted-foreground">
                  Este cliente todavía no tiene inyectores registrados.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Número
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Descripción
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Estado
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {loadState.injectors.map((injector) => (
                      <tr
                        key={injector.id}
                        className="border-b border-[var(--color-border-soft)] last:border-b-0"
                      >
                        <td className="px-5 py-4 font-mono text-sm font-semibold text-foreground">
                          {injector.injector_number}
                        </td>

                        <td className="px-5 py-4 text-sm text-muted-foreground">
                          {injector.description || "—"}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={[
                              "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                              injector.is_active
                                ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                                : "bg-surface-muted text-muted-foreground",
                            ].join(" ")}
                          >
                            {injector.is_active ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="app-status-card overflow-hidden">
            <div className="border-b border-[var(--color-border-soft)] p-6">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                Ventas recientes
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Últimas ventas registradas para este cliente.
              </p>
            </div>

            {loadState.sales.length === 0 ? (
              <div className="p-6">
                <p className="text-sm text-muted-foreground">
                  Este cliente todavía no tiene ventas registradas.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
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
                    {loadState.sales.map((sale) => (
                      <tr
                        key={sale.id}
                        tabIndex={0}
                        role="link"
                        aria-label={`Abrir venta ${sale.id}`}
                        onClick={() => {
                          router.push(`/sales/${sale.id}`);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            router.push(`/sales/${sale.id}`);
                          }
                        }}
                        className="cursor-pointer border-b border-[var(--color-border-soft)] transition-colors last:border-b-0 hover:bg-[rgb(7_81_132_/_3%)] focus:bg-[var(--color-primary-soft)] focus:outline-none"
                      >
                        <td className="px-5 py-4 text-sm text-foreground">{sale.sale_date}</td>

                        <td className="px-5 py-4 text-sm font-semibold text-foreground">
                          {formatMoney(sale.total)} CRC
                        </td>

                        <td className="px-5 py-4 text-sm text-muted-foreground">
                          {SALE_STATUS_LABELS[sale.status] ?? sale.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
