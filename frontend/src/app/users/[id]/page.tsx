"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { ArrowLeftIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { isAdministrativeUser } from "@/features/auth/permissions";
import { getUser } from "@/features/users/api";
import type { User } from "@/features/users/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      targetUser: null;
      message: null;
    }
  | {
      status: "success";
      targetUser: User;
      message: null;
    }
  | {
      status: "not-found" | "forbidden" | "error";
      targetUser: null;
      message: string;
    };

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  INVENTORY: "Inventario",
  SALES: "Ventas",
  CUSTOMERS: "Clientes y servicio",
  READ_ONLY: "Solo lectura",
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

  return "No fue posible consultar el usuario.";
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    targetUser: null,
    message: null,
  });

  const userId = Number(params.id);

  const hasAccess = user ? isAdministrativeUser(user) : false;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasAccess ||
      !Number.isInteger(userId) ||
      userId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    getUser(token, userId, controller.signal)
      .then((targetUser) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", targetUser, message: null });
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
            targetUser: null,
            message: "Este usuario no tiene permisos para consultar usuarios.",
          });

          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setLoadState({
            status: "not-found",
            targetUser: null,
            message: "El usuario solicitado no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          targetUser: null,
          message: getErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasAccess, logout, router, token, userId]);

  function goBack(): void {
    router.back();
  }

  if (!Number.isInteger(userId) || userId <= 0) {
    return (
      <AppShell
        title="Usuario no válido"
        description="La dirección proporcionada no identifica un usuario."
      >
        <StatePanel
          title="Identificador incorrecto"
          message="Regrese al listado y seleccione un usuario válido."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/users");
              }}
            >
              Volver a usuarios
            </Button>
          }
        />
      </AppShell>
    );
  }

  if (authStatus === "authenticated" && user && !hasAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Este módulo requiere permisos de administración."
      >
        <StatePanel
          title="No tiene acceso al usuario"
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
        loadState.status === "success" ? loadState.targetUser.username : "Detalle de usuario"
      }
      description={
        loadState.status === "success"
          ? [loadState.targetUser.first_name, loadState.targetUser.last_name]
              .filter(Boolean)
              .join(" ") || "Sin nombre registrado."
          : "Información registrada del usuario."
      }
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {loadState.status === "success" && (
            <Button
              type="button"
              onClick={() => {
                router.push(`/users/${loadState.targetUser.id}/edit`);
              }}
            >
              Editar usuario
            </Button>
          )}

          <Button type="button" variant="secondary" onClick={goBack}>
            <ArrowLeftIcon />
            Volver
          </Button>
        </div>
      }
    >
      {loadState.status === "loading" && <LoadingState message="Consultando usuario…" />}

      {loadState.status === "forbidden" && (
        <StatePanel title="Acceso restringido" message={loadState.message} tone="warning" />
      )}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Usuario no encontrado"
          message={loadState.message}
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/users");
              }}
            >
              Volver al catálogo
            </Button>
          }
        />
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar el usuario"
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
                  {loadState.targetUser.username}
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {loadState.targetUser.is_superuser
                    ? "Superusuario: acceso total al sistema, incluyendo Django admin."
                    : loadState.targetUser.is_staff
                      ? "Acceso administrativo (is_staff): administra usuarios y todos los módulos."
                      : "Cuenta de usuario estándar."}
                </p>
              </div>

              <span
                className={[
                  "inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                  loadState.targetUser.is_active
                    ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                    : "bg-surface-muted text-muted-foreground",
                ].join(" ")}
              >
                <span
                  className={[
                    "size-1.5 rounded-full",
                    loadState.targetUser.is_active
                      ? "bg-[var(--color-success)]"
                      : "bg-[var(--color-text-subtle)]",
                  ].join(" ")}
                  aria-hidden="true"
                />

                {loadState.targetUser.is_active ? "Activo" : "Inactivo"}
              </span>
            </div>

            <dl className="border-t border-[var(--color-border-soft)]">
              <div className="app-status-row">
                <dt>Nombre</dt>
                <dd>
                  {[loadState.targetUser.first_name, loadState.targetUser.last_name]
                    .filter(Boolean)
                    .join(" ") || "Sin nombre registrado"}
                </dd>
              </div>

              <div className="app-status-row">
                <dt>Correo electrónico</dt>
                <dd>{loadState.targetUser.email || "Sin correo registrado"}</dd>
              </div>

              <div className="app-status-row">
                <dt>Acceso administrativo (is_staff)</dt>
                <dd>{loadState.targetUser.is_staff ? "Sí" : "No"}</dd>
              </div>

              <div className="app-status-row">
                <dt>Roles</dt>
                <dd>
                  {loadState.targetUser.groups.length > 0
                    ? loadState.targetUser.groups
                        .map((role) => ROLE_LABELS[role] ?? role)
                        .join(", ")
                    : "Sin roles asignados"}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      )}
    </AppShell>
  );
}
