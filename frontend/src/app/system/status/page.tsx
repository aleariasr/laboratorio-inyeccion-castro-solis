"use client";

import {
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { getSystemStatus } from "@/features/system-status/api";
import type { SystemStatusResponse } from "@/features/system-status/types";
import {
  ApiError,
  ApiNetworkError,
  ApiTimeoutError,
} from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      data: null;
      message: null;
    }
  | {
      status: "success";
      data: SystemStatusResponse;
      message: null;
    }
  | {
      status: "forbidden" | "error";
      data: null;
      message: string;
    };

const MODULE_LABELS: Record<string, string> = {
  accounts: "Usuarios y acceso",
  inventory: "Inventario",
  customers: "Clientes e inyectores",
  sales: "Ventas",
  reports: "Reportes",
  documents: "Documentos",
  search: "Búsqueda",
  configuration: "Configuración",
};

function formatServerTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Costa_Rica",
  }).format(date);
}

function getEnvironmentLabel(value: string): string {
  if (value === "production") {
    return "Producción";
  }

  if (value === "development") {
    return "Desarrollo";
  }

  return value;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "El sistema tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible consultar el estado del sistema.";
}

export default function SystemStatusPage() {
  const router = useRouter();

  const {
    status: authStatus,
    user,
    token,
    logout,
  } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    data: null,
    message: null,
  });

  const hasAdministrativeAccess =
    user?.is_superuser === true ||
    user?.is_staff === true ||
    user?.groups.includes("ADMIN") === true;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasAdministrativeAccess
    ) {
      return;
    }

    const controller = new AbortController();

    getSystemStatus(token, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({
          status: "success",
          data,
          message: null,
        });
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

        if (error instanceof ApiError && error.status === 403) {
          setLoadState({
            status: "forbidden",
            data: null,
            message:
              "Este usuario no tiene permiso para consultar esta información.",
          });

          return;
        }

        setLoadState({
          status: "error",
          data: null,
          message: getErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [
    authStatus,
    hasAdministrativeAccess,
    logout,
    router,
    token,
  ]);

  async function handleRetry(): Promise<void> {
    if (!token) {
      return;
    }

    setLoadState({
      status: "loading",
      data: null,
      message: null,
    });

    try {
      const data = await getSystemStatus(token);

      setLoadState({
        status: "success",
        data,
        message: null,
      });
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
          message:
            "Este usuario no tiene permiso para consultar esta información.",
        });

        return;
      }

      setLoadState({
        status: "error",
        data: null,
        message: getErrorMessage(error),
      });
    }
  }

  if (
    authStatus === "authenticated" &&
    user &&
    !hasAdministrativeAccess
  ) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Esta sección está disponible únicamente para administración."
      >
        <section
          className="max-w-xl rounded-[var(--radius-xl)] bg-surface p-7 shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]"
          role="alert"
        >
          <p className="text-sm leading-6 text-muted-foreground">
            Su usuario no tiene permisos para consultar el estado
            técnico del sistema.
          </p>

          <Button
            type="button"
            variant="secondary"
            className="mt-6"
            onClick={() => {
              router.replace("/dashboard");
            }}
          >
            Volver al inicio
          </Button>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Estado del sistema"
      description="Información de la instalación y del entorno local."
    >
      {loadState.status === "loading" && (
        <div
          className="flex min-h-56 items-center justify-center"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span
              className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
              aria-hidden="true"
            />

            Consultando información…
          </div>
        </div>
      )}

      {loadState.status === "forbidden" && (
        <section
          className="max-w-xl rounded-[var(--radius-xl)] bg-surface p-7 shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]"
          role="alert"
        >
          <h2 className="text-lg font-semibold text-foreground">
            Acceso restringido
          </h2>

          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {loadState.message}
          </p>
        </section>
      )}

      {loadState.status === "error" && (
        <section
          className="max-w-xl rounded-[var(--radius-xl)] bg-surface p-7 shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]"
          role="alert"
        >
          <h2 className="text-lg font-semibold text-foreground">
            No se pudo cargar la información
          </h2>

          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {loadState.message}
          </p>

          <Button
            type="button"
            className="mt-6"
            onClick={() => {
              void handleRetry();
            }}
          >
            Reintentar
          </Button>
        </section>
      )}

      {loadState.status === "success" && (
        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <section className="app-status-card overflow-hidden xl:row-span-2">
            <div className="flex flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Servicio
                </p>

                <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-foreground">
                  {loadState.data.service}
                </h2>

                <p className="mt-2 text-sm text-muted-foreground">
                  Versión {loadState.data.version}
                </p>
              </div>

              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--color-success-soft)] px-3.5 py-2 text-sm font-semibold text-[var(--color-success)]">
                <span
                  className="status-pulse size-2 rounded-full bg-[var(--color-success)]"
                  aria-hidden="true"
                />

                Disponible
              </div>
            </div>

            <dl className="border-t border-[var(--color-border-soft)]">
              <div className="app-status-row">
                <dt>Entorno</dt>

                <dd>
                  {getEnvironmentLabel(
                    loadState.data.environment.name,
                  )}
                </dd>
              </div>

              <div className="app-status-row">
                <dt>Depuración</dt>

                <dd>
                  {loadState.data.environment.debug
                    ? "Activada"
                    : "Desactivada"}
                </dd>
              </div>

              <div className="app-status-row">
                <dt>Hora del servidor</dt>

                <dd>
                  {formatServerTime(
                    loadState.data.server_time,
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="app-status-card p-6">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
              Acceso
            </h2>

            <dl className="mt-5 space-y-5">
              <div>
                <dt className="text-sm text-muted-foreground">
                  Usuario
                </dt>

                <dd className="mt-1 text-sm font-semibold text-foreground">
                  {loadState.data.user.username}
                </dd>
              </div>

              <div>
                <dt className="text-sm text-muted-foreground">
                  Grupos
                </dt>

                <dd className="mt-1 text-sm font-semibold text-foreground">
                  {loadState.data.user.groups.length > 0
                    ? loadState.data.user.groups.join(", ")
                    : "Sin grupos asignados"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="app-status-card p-6">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
              Módulos
            </h2>

            <ul className="mt-5 flex flex-wrap gap-2">
              {loadState.data.modules.map((module) => (
                <li
                  key={module}
                  className="rounded-full bg-surface-muted px-3 py-1.5 text-sm font-medium text-foreground"
                >
                  {MODULE_LABELS[module] ?? module}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </AppShell>
  );
}