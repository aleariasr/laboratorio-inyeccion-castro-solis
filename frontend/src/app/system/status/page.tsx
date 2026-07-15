"use client";

import {
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { AppLogo } from "@/components/branding/app-logo";
import { LoadingState } from "@/components/feedback/loading-state";
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
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "America/Costa_Rica",
  }).format(date);
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
    if (authStatus === "unauthenticated") {
      router.replace("/login");
    }
  }, [authStatus, router]);

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
              "Tu usuario no tiene permisos para consultar el estado administrativo.",
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

  async function handleLogout(): Promise<void> {
    await logout();
    router.replace("/login");
  }

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
            "Tu usuario no tiene permisos para consultar el estado administrativo.",
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

  if (authStatus !== "authenticated" || !user) {
    return (
      <LoadingState
        fullScreen
        message="Verificando acceso…"
      />
    );
  }

  if (!hasAdministrativeAccess) {
    return (
      <main className="min-h-screen bg-background px-5 py-6 sm:px-8">
        <div className="mx-auto max-w-4xl motion-enter">
          <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
            <AppLogo />

            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/dashboard");
              }}
            >
              Volver al inicio
            </Button>
          </header>

          <section
            className="mt-8 rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-sm"
            role="alert"
          >
            <h1 className="text-xl font-semibold text-foreground">
              Acceso restringido
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Esta sección está reservada para administración y soporte
              técnico.
            </p>
          </section>
        </div>
      </main>
    );
  }

  if (loadState.status === "loading") {
    return (
      <LoadingState
        fullScreen
        message="Consultando estado del sistema…"
      />
    );
  }

  const fullName = [
    user.first_name,
    user.last_name,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="min-h-screen bg-background px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl motion-enter">
        <header className="flex flex-col gap-6 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
          <AppLogo />

          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 text-left sm:text-right">
              <p className="truncate text-sm font-medium text-foreground">
                {fullName || user.username}
              </p>

              <p className="text-xs text-muted-foreground">
                {user.username}
              </p>
            </div>

            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                router.replace("/dashboard");
              }}
            >
              Volver al inicio
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void handleLogout();
              }}
            >
              Cerrar sesión
            </Button>
          </div>
        </header>

        <section className="py-8">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-[var(--color-brand-blue)]">
              Administración
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-4xl">
              Estado del sistema
            </h1>

            <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
              Información técnica de la instalación para administración
              y soporte.
            </p>
          </div>
        </section>

        {loadState.status === "forbidden" && (
          <section
            className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-sm"
            role="alert"
          >
            <h2 className="text-sm font-semibold text-foreground">
              Acceso restringido
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {loadState.message}
            </p>

            <div className="mt-5">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  router.replace("/dashboard");
                }}
              >
                Volver al inicio
              </Button>
            </div>
          </section>
        )}

        {loadState.status === "error" && (
          <section
            className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-sm"
            role="alert"
          >
            <h2 className="text-sm font-semibold text-foreground">
              No se pudo cargar la información
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {loadState.message}
            </p>

            <div className="mt-5">
              <Button
                type="button"
                onClick={() => {
                  void handleRetry();
                }}
              >
                Reintentar
              </Button>
            </div>
          </section>
        )}

        {loadState.status === "success" && (
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-sm sm:p-7">
              <div className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Servicio
                  </p>

                  <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-foreground">
                    {loadState.data.service}
                  </h2>
                </div>

                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1.5">
                  <span
                    className="size-2 rounded-full bg-[var(--color-brand-blue)]"
                    aria-hidden="true"
                  />

                  <span className="text-xs font-semibold text-foreground">
                    Disponible
                  </span>
                </div>
              </div>

              <dl className="grid gap-6 pt-6 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Versión
                  </dt>

                  <dd className="mt-2 text-sm font-medium text-foreground">
                    {loadState.data.version}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Entorno
                  </dt>

                  <dd className="mt-2 text-sm font-medium capitalize text-foreground">
                    {loadState.data.environment.name}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Depuración
                  </dt>

                  <dd className="mt-2 text-sm font-medium text-foreground">
                    {loadState.data.environment.debug
                      ? "Activada"
                      : "Desactivada"}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Hora del servidor
                  </dt>

                  <dd className="mt-2 text-sm font-medium text-foreground">
                    {formatServerTime(
                      loadState.data.server_time,
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-sm sm:p-7">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                Acceso administrativo
              </h2>

              <dl className="mt-6 space-y-5">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Usuario
                  </dt>

                  <dd className="mt-2 text-sm font-medium text-foreground">
                    {loadState.data.user.username}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Tipo de acceso
                  </dt>

                  <dd className="mt-2 text-sm font-medium text-foreground">
                    {loadState.data.user.is_superuser
                      ? "Superusuario"
                      : loadState.data.user.is_staff
                        ? "Personal administrativo"
                        : "Grupo ADMIN"}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Grupos
                  </dt>

                  <dd className="mt-2 text-sm font-medium text-foreground">
                    {loadState.data.user.groups.length > 0
                      ? loadState.data.user.groups.join(", ")
                      : "Sin grupos asignados"}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-sm sm:p-7 lg:col-span-2">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                Módulos disponibles
              </h2>

              <p className="mt-2 text-sm text-muted-foreground">
                Componentes habilitados en esta instalación.
              </p>

              <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {loadState.data.modules.map((module) => (
                  <li
                    key={module}
                    className="rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 py-3"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {MODULE_LABELS[module] ?? module}
                    </p>

                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {module}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}