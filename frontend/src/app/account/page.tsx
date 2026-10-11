"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { ArrowLeftIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import {
  NAVIGATION_ITEMS,
  NAVIGATION_SECTIONS,
} from "@/components/navigation/navigation-config";
import { canAccessNavigationItem } from "@/components/navigation/navigation-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeOwnPassword } from "@/features/auth/api";
import { useAuth } from "@/features/auth/auth-context";
import type { AuthUser } from "@/features/auth/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

const MINIMUM_PASSWORD_LENGTH = 8;

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  INVENTORY: "Inventario",
  SALES: "Ventas",
  CUSTOMERS: "Clientes y servicio",
  READ_ONLY: "Solo lectura",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN: "Acceso completo, incluidos usuarios y reportes.",
  INVENTORY: "Productos, ubicaciones, proveedores, compras y conteos.",
  SALES: "Registro y anulación de ventas.",
  CUSTOMERS: "Clientes, inyectores y servicios.",
  READ_ONLY: "Consulta, sin posibilidad de modificar.",
};

type FormErrors = {
  currentPassword?: string;
  newPassword?: string;
  repeatedPassword?: string;
};

function getInitials(user: AuthUser): string {
  const first = user.first_name.trim().charAt(0);
  const last = user.last_name.trim().charAt(0);

  const initials = `${first}${last}`.trim();

  return (initials || user.username.slice(0, 2)).toUpperCase();
}

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "El cambio de contraseña tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible cambiar la contraseña.";
}

export default function AccountPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout, replaceToken } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");

  const [newPassword, setNewPassword] = useState("");

  const [repeatedPassword, setRepeatedPassword] = useState("");

  const [errors, setErrors] = useState<FormErrors>({});

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [wasChanged, setWasChanged] = useState(false);

  function validate(): FormErrors {
    const nextErrors: FormErrors = {};

    if (!currentPassword) {
      nextErrors.currentPassword = "Escriba su contraseña actual.";
    }

    if (newPassword.length < MINIMUM_PASSWORD_LENGTH) {
      nextErrors.newPassword = `Debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres.`;
    }

    if (repeatedPassword !== newPassword) {
      nextErrors.repeatedPassword = "Las dos contraseñas nuevas no coinciden.";
    }

    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!token || isSubmitting) {
      return;
    }

    const validationErrors = validate();

    setErrors(validationErrors);
    setSubmitError(null);
    setWasChanged(false);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await changeOwnPassword(token, {
        current_password: currentPassword,
        new_password: newPassword,
      });

      // El backend invalidó el token viejo: sin esto, la siguiente
      // consulta devolvería 401 y la sesión se cerraría sola.
      replaceToken(response.token);

      setCurrentPassword("");
      setNewPassword("");
      setRepeatedPassword("");
      setWasChanged(true);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 400) {
        const currentPasswordError = error.fieldErrors.current_password?.[0];
        const newPasswordError = error.fieldErrors.new_password?.[0];

        if (currentPasswordError || newPasswordError) {
          setErrors({
            currentPassword: currentPasswordError,
            newPassword: newPasswordError,
          });

          return;
        }
      }

      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      setSubmitError(getSubmitErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (authStatus !== "authenticated" || !user) {
    return (
      <AppShell title="Mi cuenta" description="Datos de su sesión.">
        <div />
      </AppShell>
    );
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");

  // Las pantallas que esta persona puede abrir, calculadas con la misma
  // regla que arma el menú lateral: así nunca se desincronizan.
  const accessibleSections = NAVIGATION_SECTIONS.map((section) => ({
    ...section,
    items: NAVIGATION_ITEMS.filter(
      (item) => item.section === section.id && canAccessNavigationItem(user, item),
    ),
  })).filter((section) => section.items.length > 0);

  return (
    <AppShell
      title="Mi cuenta"
      description="Sus datos de acceso y lo que puede usar en el sistema."
      actions={
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
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:items-start">
        <div className="grid gap-6">
          <section className="app-status-card overflow-hidden">
            <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
              <span
                className="flex size-16 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-lg font-semibold text-[var(--color-brand-blue)]"
                aria-hidden="true"
              >
                {getInitials(user)}
              </span>

              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold tracking-[-0.025em] text-foreground">
                  {fullName || user.username}
                </h2>

                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {user.username}
                  {user.email ? ` · ${user.email}` : ""}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {user.groups.length > 0 ? (
                    user.groups.map((role) => (
                      <span
                        key={role}
                        className="inline-flex items-center rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-brand-blue)]"
                      >
                        {ROLE_LABELS[role] ?? role}
                      </span>
                    ))
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                      Sin rol asignado
                    </span>
                  )}

                  {user.is_superuser && (
                    <span className="inline-flex items-center rounded-full bg-[var(--color-warning-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-warning)]">
                      Superusuario
                    </span>
                  )}

                  {user.is_staff && !user.is_superuser && (
                    <span className="inline-flex items-center rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                      Administra usuarios
                    </span>
                  )}
                </div>
              </div>
            </div>

            <dl className="border-t border-[var(--color-border-soft)]">
              <div className="app-status-row">
                <dt>Nombre</dt>
                <dd>{fullName || "Sin nombre registrado"}</dd>
              </div>

              <div className="app-status-row">
                <dt>Usuario</dt>
                <dd>{user.username}</dd>
              </div>

              <div className="app-status-row">
                <dt>Correo electrónico</dt>
                <dd>{user.email || "Sin correo registrado"}</dd>
              </div>

              <div className="app-status-row">
                <dt>Roles</dt>
                <dd>
                  {user.groups.length > 0
                    ? user.groups.map((role) => ROLE_LABELS[role] ?? role).join(", ")
                    : "Sin roles asignados"}
                </dd>
              </div>
            </dl>

            <p className="border-t border-[var(--color-border-soft)] px-6 py-4 text-xs text-muted-foreground">
              Sus datos y sus roles los administra una persona con acceso a
              Usuarios. Si algo está mal, pídaselo a ella.
            </p>
          </section>

          <section className="app-status-card overflow-hidden">
            <div className="border-b border-[var(--color-border-soft)] p-6">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                A qué tiene acceso
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Las pantallas que puede abrir con sus roles actuales.
              </p>
            </div>

            <div className="grid gap-6 p-6 sm:grid-cols-2">
              {accessibleSections.map((section) => (
                <div key={section.id}>
                  <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {section.label}
                  </p>

                  <ul className="mt-3 grid gap-2">
                    {section.items.map((item) => {
                      const Icon = item.icon;

                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary hover:underline"
                          >
                            <span
                              className="flex size-7 shrink-0 items-center justify-center rounded-[10px] bg-surface-muted text-muted-foreground"
                              aria-hidden="true"
                            >
                              <Icon className="size-4" />
                            </span>

                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            {user.groups.length > 0 && (
              <div className="border-t border-[var(--color-border-soft)] px-6 py-4">
                <p className="text-xs text-muted-foreground">
                  {user.groups
                    .map((role) => ROLE_DESCRIPTIONS[role])
                    .filter(Boolean)
                    .join(" ")}
                </p>
              </div>
            )}
          </section>
        </div>

        <section className="app-status-card overflow-hidden xl:sticky xl:top-6">
          <div className="border-b border-[var(--color-border-soft)] p-6">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
              Cambiar mi contraseña
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Mínimo {MINIMUM_PASSWORD_LENGTH} caracteres. Se cierran las
              sesiones abiertas en otras computadoras; en esta puede seguir
              trabajando.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="grid gap-5 p-6">
            {wasChanged && (
              <p
                role="status"
                className="rounded-[var(--radius-md)] bg-[var(--color-success-soft)] px-4 py-3 text-sm font-medium text-[var(--color-success)]"
              >
                Contraseña cambiada. Úsela la próxima vez que inicie sesión.
              </p>
            )}

            {submitError && <FormError message={submitError} />}

            <Field
              id="current-password"
              label="Contraseña actual"
              required
              error={errors.currentPassword}
            >
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                }}
                hasError={Boolean(errors.currentPassword)}
                autoComplete="current-password"
                disabled={isSubmitting}
              />
            </Field>

            <Field
              id="new-password"
              label="Contraseña nueva"
              required
              error={errors.newPassword}
            >
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                }}
                hasError={Boolean(errors.newPassword)}
                autoComplete="new-password"
                disabled={isSubmitting}
              />
            </Field>

            <Field
              id="repeated-password"
              label="Repita la contraseña nueva"
              required
              error={errors.repeatedPassword}
            >
              <Input
                id="repeated-password"
                type="password"
                value={repeatedPassword}
                onChange={(event) => {
                  setRepeatedPassword(event.target.value);
                }}
                hasError={Boolean(errors.repeatedPassword)}
                autoComplete="new-password"
                disabled={isSubmitting}
              />
            </Field>

            <Button
              type="submit"
              className="w-full"
              isLoading={isSubmitting}
              loadingText="Guardando…"
            >
              Cambiar contraseña
            </Button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
