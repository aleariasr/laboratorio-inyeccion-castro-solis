"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { Field } from "@/components/forms/field";
import { ArrowLeftIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { isAdministrativeUser } from "@/features/auth/permissions";
import { getUser, setUserPassword } from "@/features/users/api";
import type { User } from "@/features/users/types";
import { confirmWithFocusRestore } from "@/lib/dom/confirm-with-focus-restore";
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

const MINIMUM_PASSWORD_LENGTH = 8;

type ResetPasswordState = {
  isOpen: boolean;
  password: string;
  repeated: string;
  isSubmitting: boolean;
  error: string | null;
  wasReset: boolean;
};

const EMPTY_RESET_PASSWORD_STATE: ResetPasswordState = {
  isOpen: false,
  password: "",
  repeated: "",
  isSubmitting: false,
  error: null,
  wasReset: false,
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

  const [resetState, setResetState] = useState<ResetPasswordState>(
    EMPTY_RESET_PASSWORD_STATE,
  );

  const userId = Number(params.id);

  const hasAccess = user ? isAdministrativeUser(user) : false;

  const isOwnUser =
    loadState.status === "success" && user?.id === loadState.targetUser.id;

  async function handleResetPassword(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!token || loadState.status !== "success" || resetState.isSubmitting) {
      return;
    }

    if (resetState.password.length < MINIMUM_PASSWORD_LENGTH) {
      setResetState((current) => ({
        ...current,
        error: `La contraseña debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres.`,
      }));

      return;
    }

    if (resetState.password !== resetState.repeated) {
      setResetState((current) => ({
        ...current,
        error: "Las dos contraseñas no coinciden.",
      }));

      return;
    }

    if (
      !confirmWithFocusRestore(
        `¿Restablecer la contraseña de ${loadState.targetUser.username}? Se cerrarán sus sesiones abiertas y tendrá que entrar con la contraseña nueva.`,
      )
    ) {
      return;
    }

    setResetState((current) => ({
      ...current,
      isSubmitting: true,
      error: null,
    }));

    try {
      await setUserPassword(token, loadState.targetUser.id, resetState.password);

      setResetState({
        ...EMPTY_RESET_PASSWORD_STATE,
        wasReset: true,
      });
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      setResetState((current) => ({
        ...current,
        isSubmitting: false,
        error:
          error instanceof ApiError
            ? error.message
            : "No fue posible restablecer la contraseña.",
      }));
    }
  }

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
                      ? "Administración de usuarios (is_staff): administra usuarios y roles y ve el estado del sistema. No da acceso a los módulos de negocio."
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
                <dt>Administración de usuarios (is_staff)</dt>
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

              <div className="app-status-row">
                <dt>Costos</dt>
                <dd>
                  {loadState.targetUser.is_superuser ||
                  loadState.targetUser.groups.includes("ADMIN")
                    ? "Sí, por el rol Administrador"
                    : loadState.targetUser.permissions.includes("view_costs")
                      ? "Sí, permiso asignado"
                      : "No"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="app-status-card p-6">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
              Contraseña
            </h2>

            {isOwnUser ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Para cambiar su propia contraseña use &ldquo;Cambiar mi
                contraseña&rdquo;, abajo en el menú: ahí se pide la contraseña
                actual y la sesión no se cierra.
              </p>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  Úselo cuando la persona olvidó su contraseña. No hace falta
                  la anterior. Al restablecerla se cierran sus sesiones
                  abiertas.
                </p>

                {resetState.wasReset && (
                  <p className="mt-4 text-sm font-medium text-foreground">
                    Contraseña restablecida. Entréguele la nueva a{" "}
                    {loadState.targetUser.username}.
                  </p>
                )}

                {resetState.isOpen ? (
                  <form
                    onSubmit={handleResetPassword}
                    noValidate
                    className="mt-5 grid max-w-md gap-5"
                  >
                    {resetState.error && <FormError message={resetState.error} />}

                    <Field
                      id="reset-password"
                      label="Contraseña nueva"
                      required
                      hint={`Mínimo ${MINIMUM_PASSWORD_LENGTH} caracteres.`}
                    >
                      <Input
                        id="reset-password"
                        type="password"
                        value={resetState.password}
                        onChange={(event) => {
                          const password = event.target.value;

                          setResetState((current) => ({ ...current, password }));
                        }}
                        autoComplete="new-password"
                        disabled={resetState.isSubmitting}
                      />
                    </Field>

                    <Field id="reset-password-repeat" label="Repita la contraseña" required>
                      <Input
                        id="reset-password-repeat"
                        type="password"
                        value={resetState.repeated}
                        onChange={(event) => {
                          const repeated = event.target.value;

                          setResetState((current) => ({ ...current, repeated }));
                        }}
                        autoComplete="new-password"
                        disabled={resetState.isSubmitting}
                      />
                    </Field>

                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="submit"
                        isLoading={resetState.isSubmitting}
                        loadingText="Guardando…"
                      >
                        Restablecer contraseña
                      </Button>

                      <Button
                        type="button"
                        variant="secondary"
                        disabled={resetState.isSubmitting}
                        onClick={() => {
                          setResetState(EMPTY_RESET_PASSWORD_STATE);
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="mt-4">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setResetState({
                          ...EMPTY_RESET_PASSWORD_STATE,
                          isOpen: true,
                        });
                      }}
                    >
                      Restablecer contraseña
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
