"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { ArrowLeftIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import {
  canReadInjectors,
  canReadServices,
  canWriteInjectors,
} from "@/features/auth/permissions";
import { formatDate } from "@/features/inventory/purchases/format";
import { getInjector, getInjectorServiceRecords } from "@/features/injectors/api";
import type { Injector, InjectorServiceRecordSummary } from "@/features/injectors/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      injector: null;
      message: null;
    }
  | {
      status: "success";
      injector: Injector;
      message: null;
    }
  | {
      status: "not-found" | "forbidden" | "error";
      injector: null;
      message: string;
    };

type ServiceRecordsLoadState =
  | { status: "loading"; serviceRecords: null; message: null }
  | { status: "success"; serviceRecords: InjectorServiceRecordSummary[]; message: null }
  | { status: "forbidden" | "error"; serviceRecords: null; message: string };

const SERVICE_STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Recibido",
  IN_PROGRESS: "En proceso",
  READY: "Listo",
  DELIVERED: "Entregado",
  CANCELLED: "Anulado",
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

  return "No fue posible consultar el inyector.";
}

export default function InjectorDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    injector: null,
    message: null,
  });

  const [serviceRecordsLoadState, setServiceRecordsLoadState] =
    useState<ServiceRecordsLoadState>({
      status: "loading",
      serviceRecords: null,
      message: null,
    });

  const injectorId = Number(params.id);

  const hasCustomersAccess = user ? canReadInjectors(user) : false;

  const hasWriteAccess = user ? canWriteInjectors(user) : false;

  const hasServicesAccess = user ? canReadServices(user) : false;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasCustomersAccess ||
      !Number.isInteger(injectorId) ||
      injectorId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    getInjector(token, injectorId, controller.signal)
      .then((injector) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", injector, message: null });
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
            injector: null,
            message: "Este usuario no tiene permisos para consultar inyectores.",
          });

          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setLoadState({
            status: "not-found",
            injector: null,
            message: "El inyector solicitado no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          injector: null,
          message: getErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasCustomersAccess, injectorId, logout, router, token]);

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasCustomersAccess ||
      !hasServicesAccess ||
      !Number.isInteger(injectorId) ||
      injectorId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    getInjectorServiceRecords(token, injectorId, controller.signal)
      .then((serviceRecords) => {
        if (controller.signal.aborted) {
          return;
        }

        setServiceRecordsLoadState({ status: "success", serviceRecords, message: null });
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
          setServiceRecordsLoadState({
            status: "forbidden",
            serviceRecords: null,
            message: "Este usuario no tiene permisos para consultar servicios.",
          });

          return;
        }

        setServiceRecordsLoadState({
          status: "error",
          serviceRecords: null,
          message: getErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasCustomersAccess, hasServicesAccess, injectorId, logout, router, token]);

  function goBack(): void {
    router.back();
  }

  if (!Number.isInteger(injectorId) || injectorId <= 0) {
    return (
      <AppShell
        title="Inyector no válido"
        description="La dirección proporcionada no identifica un inyector."
      >
        <StatePanel
          title="Identificador incorrecto"
          message="Regrese al listado y seleccione un inyector válido."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/injectors");
              }}
            >
              Volver a inyectores
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
        description="Este módulo requiere permisos de inyectores."
      >
        <StatePanel
          title="No tiene acceso al inyector"
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
        loadState.status === "success" ? loadState.injector.injector_number : "Detalle de inyector"
      }
      description={
        loadState.status === "success"
          ? loadState.injector.customer_detail.display_name
          : "Información registrada del inyector."
      }
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {loadState.status === "success" && hasWriteAccess && (
            <Button
              type="button"
              onClick={() => {
                router.push(`/injectors/${loadState.injector.id}/edit`);
              }}
            >
              Editar inyector
            </Button>
          )}

          <Button type="button" variant="secondary" onClick={goBack}>
            <ArrowLeftIcon />
            Volver
          </Button>
        </div>
      }
    >
      {loadState.status === "loading" && <LoadingState message="Consultando inyector…" />}

      {loadState.status === "forbidden" && (
        <StatePanel title="Acceso restringido" message={loadState.message} tone="warning" />
      )}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Inyector no encontrado"
          message={loadState.message}
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/injectors");
              }}
            >
              Volver al catálogo
            </Button>
          }
        />
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar el inyector"
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
                  {loadState.injector.injector_number}
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {loadState.injector.notes || "Sin notas registradas."}
                </p>
              </div>

              <span
                className={[
                  "inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                  loadState.injector.is_active
                    ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                    : "bg-surface-muted text-muted-foreground",
                ].join(" ")}
              >
                <span
                  className={[
                    "size-1.5 rounded-full",
                    loadState.injector.is_active
                      ? "bg-[var(--color-success)]"
                      : "bg-[var(--color-text-subtle)]",
                  ].join(" ")}
                  aria-hidden="true"
                />

                {loadState.injector.is_active ? "Activo" : "Inactivo"}
              </span>
            </div>

            <dl className="border-t border-[var(--color-border-soft)]">
              <div className="app-status-row">
                <dt>Cliente</dt>
                <dd>
                  <Link
                    href={`/customers/${loadState.injector.customer}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {loadState.injector.customer_detail.display_name}
                  </Link>
                </dd>
              </div>

              <div className="app-status-row">
                <dt>Descripción</dt>
                <dd>{loadState.injector.description || "Sin descripción registrada"}</dd>
              </div>

              <div className="app-status-row">
                <dt>Fecha de creación</dt>
                <dd>{formatDate(loadState.injector.created_at)}</dd>
              </div>

              <div className="app-status-row">
                <dt>Última modificación</dt>
                <dd>{formatDate(loadState.injector.updated_at)}</dd>
              </div>
            </dl>
          </section>

          <section className="app-status-card overflow-hidden">
            <div className="border-b border-[var(--color-border-soft)] p-6">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                Historial de servicios
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                La gestión de servicios se implementará en el próximo paso.
              </p>
            </div>

            {!hasServicesAccess && (
              <div className="p-6">
                <StatePanel
                  title="No se pudo cargar el historial de servicios"
                  message="Este usuario no tiene permisos para consultar servicios."
                  tone="warning"
                />
              </div>
            )}

            {hasServicesAccess && serviceRecordsLoadState.status === "loading" && (
              <div className="p-6">
                <LoadingState message="Consultando servicios…" />
              </div>
            )}

            {hasServicesAccess &&
              (serviceRecordsLoadState.status === "forbidden" ||
              serviceRecordsLoadState.status === "error") && (
              <div className="p-6">
                <StatePanel
                  title="No se pudo cargar el historial de servicios"
                  message={serviceRecordsLoadState.message}
                  tone={serviceRecordsLoadState.status === "forbidden" ? "warning" : "error"}
                />
              </div>
            )}

            {hasServicesAccess && serviceRecordsLoadState.status === "success" &&
              (serviceRecordsLoadState.serviceRecords.length === 0 ? (
              <div className="p-6">
                <p className="text-sm text-muted-foreground">
                  Este inyector todavía no tiene servicios registrados.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Recibido
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Entregado
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Estado
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {serviceRecordsLoadState.serviceRecords.map((serviceRecord) => (
                      <tr
                        key={serviceRecord.id}
                        className="border-b border-[var(--color-border-soft)] last:border-b-0"
                      >
                        <td className="px-5 py-4 text-sm text-foreground">
                          {formatDate(serviceRecord.received_at)}
                        </td>

                        <td className="px-5 py-4 text-sm text-muted-foreground">
                          {serviceRecord.delivered_at
                            ? formatDate(serviceRecord.delivered_at)
                            : "—"}
                        </td>

                        <td className="px-5 py-4 text-sm text-muted-foreground">
                          {SERVICE_STATUS_LABELS[serviceRecord.status] ?? serviceRecord.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>
        </div>
      )}
    </AppShell>
  );
}
