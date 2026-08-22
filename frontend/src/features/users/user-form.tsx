"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut";
import type { AppRole } from "@/features/auth/permissions";

import {
  PERMISSION_ACTION_LABELS,
  PERMISSION_MODULES,
  permissionCodename,
  type PermissionAction,
  type UserFormErrors,
  type UserFormField,
  type UserFormValues,
} from "./types";
import { validateUserForm } from "./validation";

type UserFormMode = "create" | "edit";

type UserFormProps = {
  mode: UserFormMode;
  initialValues: UserFormValues;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: UserFormErrors;
  onSubmit: (values: UserFormValues) => void | Promise<void>;
  onCancel: () => void;
};

const ROLE_OPTIONS: Array<{
  value: AppRole;
  label: string;
  description: string;
}> = [
  {
    value: "ADMIN",
    label: "Administrador",
    description: "Administra usuarios, roles y accede a todos los módulos.",
  },
  {
    value: "INVENTORY",
    label: "Inventario",
    description: "Productos, ubicaciones, proveedores, compras y conteos.",
  },
  {
    value: "SALES",
    label: "Ventas",
    description: "Registro y consulta de ventas.",
  },
  {
    value: "CUSTOMERS",
    label: "Clientes y servicio",
    description: "Clientes, inyectores y servicios técnicos.",
  },
  {
    value: "READ_ONLY",
    label: "Solo lectura",
    description: "Consulta inventario, ventas y reportes sin poder modificar.",
  },
];

function sameStringSet(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value) => right.includes(value))
  );
}

function areValuesEqual(
  left: UserFormValues,
  right: UserFormValues,
): boolean {
  return (
    left.username === right.username &&
    left.password === right.password &&
    left.firstName === right.firstName &&
    left.lastName === right.lastName &&
    left.email === right.email &&
    left.isActive === right.isActive &&
    left.isStaff === right.isStaff &&
    sameStringSet(left.groups, right.groups) &&
    sameStringSet(left.permissions, right.permissions)
  );
}

function mergeErrors(
  localErrors: UserFormErrors,
  serverErrors: UserFormErrors,
): UserFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

export function UserForm({
  mode,
  initialValues,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
}: UserFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<UserFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<UserFormErrors>({});

  const isDirty = useMemo(
    () => !areValuesEqual(values, initialValues),
    [initialValues, values],
  );

  const errors = mergeErrors(localErrors, serverErrors);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      if (!isDirty || isSubmitting) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    globalThis.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      globalThis.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty, isSubmitting]);

  useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();

        if (!isSubmitting) {
          formRef.current?.requestSubmit();
        }
      }
    }

    globalThis.addEventListener("keydown", handleSaveShortcut);

    return () => {
      globalThis.removeEventListener("keydown", handleSaveShortcut);
    };
  }, [isSubmitting]);

  function updateValue(field: UserFormField, value: string | boolean): void {
    setValues((current) => ({
      ...current,
      [field]: value,
    }));

    setLocalErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = { ...current };

      delete nextErrors[field];

      return nextErrors;
    });
  }

  function handleTextChange(
    field: Exclude<UserFormField, "isActive" | "isStaff" | "groups" | "permissions">,
  ) {
    return (event: ChangeEvent<HTMLInputElement>): void => {
      updateValue(field, event.target.value);
    };
  }

  function toggleRole(role: AppRole, checked: boolean): void {
    setValues((current) => ({
      ...current,
      groups: checked
        ? [...current.groups, role]
        : current.groups.filter((currentRole) => currentRole !== role),
    }));

    setLocalErrors((current) => {
      if (!current.groups) {
        return current;
      }

      const nextErrors = { ...current };

      delete nextErrors.groups;

      return nextErrors;
    });
  }

  function togglePermission(codename: string, checked: boolean): void {
    setValues((current) => ({
      ...current,
      permissions: checked
        ? [...current.permissions, codename]
        : current.permissions.filter((current) => current !== codename),
    }));

    setLocalErrors((current) => {
      if (!current.permissions) {
        return current;
      }

      const nextErrors = { ...current };

      delete nextErrors.permissions;

      return nextErrors;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validateUserForm(values, mode);

    setLocalErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      const firstInvalidField = formRef.current?.querySelector<HTMLInputElement>("[aria-invalid='true']");

      firstInvalidField?.focus();
      return;
    }

    void onSubmit(values);
  }

  function handleCancel(): void {
    if (
      isDirty &&
      !globalThis.confirm("Hay cambios sin guardar. ¿Desea salir y descartarlos?")
    ) {
      return;
    }

    onCancel();
  }

  const submitLabel = mode === "create" ? "Crear usuario" : "Guardar cambios";

  const submittingLabel =
    mode === "create" ? "Creando usuario…" : "Guardando cambios…";

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="grid gap-6"
    >
      {submitError && <FormError message={submitError} />}

      <section className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]">
        <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            Información de la cuenta
          </h2>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Datos de acceso e identificación del usuario.
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
          <Field
            id="usuario-username"
            label="Usuario"
            required
            hint="Solo letras, números y los símbolos @ . + - _"
            error={errors.username}
          >
            <Input
              id="usuario-username"
              name="username"
              value={values.username}
              onChange={handleTextChange("username")}
              hasError={Boolean(errors.username)}
              maxLength={150}
              autoComplete="off"
              disabled={isSubmitting}
              autoFocus
            />
          </Field>

          {mode === "create" && (
            <Field
              id="usuario-password"
              label="Contraseña"
              required
              hint="Mínimo 8 caracteres."
              error={errors.password}
            >
              <Input
                id="usuario-password"
                name="password"
                type="password"
                value={values.password}
                onChange={handleTextChange("password")}
                hasError={Boolean(errors.password)}
                autoComplete="new-password"
                disabled={isSubmitting}
              />
            </Field>
          )}

          <Field id="usuario-first-name" label="Nombre" error={errors.firstName}>
            <Input
              id="usuario-first-name"
              name="firstName"
              value={values.firstName}
              onChange={handleTextChange("firstName")}
              hasError={Boolean(errors.firstName)}
              maxLength={150}
              autoComplete="off"
              disabled={isSubmitting}
            />
          </Field>

          <Field id="usuario-last-name" label="Apellido" error={errors.lastName}>
            <Input
              id="usuario-last-name"
              name="lastName"
              value={values.lastName}
              onChange={handleTextChange("lastName")}
              hasError={Boolean(errors.lastName)}
              maxLength={150}
              autoComplete="off"
              disabled={isSubmitting}
            />
          </Field>

          <Field
            id="usuario-email"
            label="Correo electrónico"
            error={errors.email}
          >
            <Input
              id="usuario-email"
              name="email"
              type="email"
              value={values.email}
              onChange={handleTextChange("email")}
              hasError={Boolean(errors.email)}
              maxLength={254}
              autoComplete="off"
              disabled={isSubmitting}
            />
          </Field>
        </div>

        <div className="border-t border-[var(--color-border-soft)] p-5 sm:p-6">
          <label
            htmlFor="usuario-is-staff"
            className="flex cursor-pointer items-start gap-3"
          >
            <input
              id="usuario-is-staff"
              name="isStaff"
              type="checkbox"
              checked={values.isStaff}
              onChange={(event) => {
                updateValue("isStaff", event.target.checked);
              }}
              disabled={isSubmitting}
              className="mt-0.5 size-5 rounded border-border accent-[var(--color-primary)]"
            />

            <span>
              <span className="block text-sm font-semibold text-foreground">
                Acceso administrativo (is_staff)
              </span>

              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Equivale al rol Administrador: permite administrar usuarios y acceder a todos los módulos, sin depender de los roles ni permisos marcados abajo.
              </span>
            </span>
          </label>

          {errors.isStaff && (
            <p role="alert" className="mt-3 text-sm font-medium text-danger">
              {errors.isStaff}
            </p>
          )}
        </div>

        {mode === "edit" && (
          <div className="border-t border-[var(--color-border-soft)] p-5 sm:p-6">
            <label
              htmlFor="usuario-active"
              className="flex cursor-pointer items-start gap-3"
            >
              <input
                id="usuario-active"
                name="isActive"
                type="checkbox"
                checked={values.isActive}
                onChange={(event) => {
                  updateValue("isActive", event.target.checked);
                }}
                disabled={isSubmitting}
                className="mt-0.5 size-5 rounded border-border accent-[var(--color-primary)]"
              />

              <span>
                <span className="block text-sm font-semibold text-foreground">
                  Usuario activo
                </span>

                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  Un usuario inactivo no puede iniciar sesión, pero se conserva para trazabilidad.
                </span>
              </span>
            </label>

            {errors.isActive && (
              <p role="alert" className="mt-3 text-sm font-medium text-danger">
                {errors.isActive}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]">
        <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            Roles
          </h2>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Atajos que otorgan de una vez el conjunto de módulos típico de cada rol. Puede marcar varios.
          </p>

          {errors.groups && (
            <p role="alert" className="mt-3 text-sm font-medium text-danger">
              {errors.groups}
            </p>
          )}
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          {ROLE_OPTIONS.map((role) => (
            <label
              key={role.value}
              htmlFor={`usuario-role-${role.value}`}
              className="flex cursor-pointer items-start gap-3"
            >
              <input
                id={`usuario-role-${role.value}`}
                name="groups"
                type="checkbox"
                checked={values.groups.includes(role.value)}
                onChange={(event) => {
                  toggleRole(role.value, event.target.checked);
                }}
                disabled={isSubmitting}
                className="mt-0.5 size-5 rounded border-border accent-[var(--color-primary)]"
              />

              <span>
                <span className="block text-sm font-semibold text-foreground">
                  {role.label}
                </span>

                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {role.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]">
        <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            Permisos por módulo
          </h2>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Además de los roles, puede marcar acceso puntual módulo por módulo, acción por acción. Estos permisos se suman a los que ya otorgue un rol marcado arriba.
          </p>

          {errors.permissions && (
            <p role="alert" className="mt-3 text-sm font-medium text-danger">
              {errors.permissions}
            </p>
          )}
        </div>

        <div className="overflow-x-auto p-5 sm:p-6">
          <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="border-b border-[var(--color-border-soft)] py-2 pr-3 text-left font-semibold text-foreground">
                  Módulo
                </th>

                {(["view", "add", "change", "cancel"] as PermissionAction[]).map((action) => (
                  <th
                    key={action}
                    scope="col"
                    className="border-b border-[var(--color-border-soft)] px-3 py-2 text-center font-semibold text-foreground"
                  >
                    {PERMISSION_ACTION_LABELS[action]}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {PERMISSION_MODULES.map((permissionModule) => (
                <tr key={permissionModule.key}>
                  <th
                    scope="row"
                    className="border-b border-[var(--color-border-soft)] py-3 pr-3 text-left font-medium text-foreground"
                  >
                    {permissionModule.label}
                  </th>

                  {(["view", "add", "change", "cancel"] as PermissionAction[]).map((action) => {
                    if (!permissionModule.actions.includes(action)) {
                      return (
                        <td
                          key={action}
                          className="border-b border-[var(--color-border-soft)] px-3 py-3 text-center text-muted-foreground"
                          aria-hidden="true"
                        >
                          —
                        </td>
                      );
                    }

                    const codename = permissionCodename(permissionModule.key, action);

                    return (
                      <td
                        key={action}
                        className="border-b border-[var(--color-border-soft)] px-3 py-3 text-center"
                      >
                        <input
                          type="checkbox"
                          checked={values.permissions.includes(codename)}
                          onChange={(event) => {
                            togglePermission(codename, event.target.checked);
                          }}
                          disabled={isSubmitting}
                          aria-label={`${permissionModule.label}: ${PERMISSION_ACTION_LABELS[action]}`}
                          className="size-5 rounded border-border accent-[var(--color-primary)]"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 rounded-[var(--radius-xl)] bg-surface p-4 shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)] sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          {isDirty ? "Hay cambios pendientes de guardar." : "No hay cambios pendientes."}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>

          <Button type="submit" isLoading={isSubmitting} loadingText={submittingLabel}>
            <span>{submitLabel}</span>

            {!isSubmitting && <KeyboardShortcut keys={["Ctrl", "S"]} />}
          </Button>
        </div>
      </div>
    </form>
  );
}
