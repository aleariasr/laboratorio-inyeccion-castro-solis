"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { isAdministrativeUser } from "@/features/auth/permissions";
import { createUser } from "@/features/users/api";
import { mapUserApiFieldErrors } from "@/features/users/form-errors";
import {
  buildUserCreatePayload,
  EMPTY_USER_FORM_VALUES,
  type UserFormErrors,
  type UserFormValues,
} from "@/features/users/types";
import { UserForm } from "@/features/users/user-form";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La creación del usuario tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local. Revise el estado del sistema e inténtelo nuevamente.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible crear el usuario.";
}

export default function NewUserPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<UserFormErrors>({});

  const hasAccess = user ? isAdministrativeUser(user) : false;

  async function handleSubmit(values: UserFormValues): Promise<void> {
    if (!token || isSubmitting || !hasAccess) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      const createdUser = await createUser(token, buildUserCreatePayload(values));

      router.replace(`/users/${createdUser.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setSubmitError("Este usuario no tiene permisos para crear usuarios.");
        return;
      }

      if (error instanceof ApiError && error.status === 400) {
        const mappedErrors = mapUserApiFieldErrors(error.fieldErrors);

        setServerErrors(mappedErrors);

        if (Object.keys(mappedErrors).length === 0) {
          setSubmitError(error.message);
        }

        return;
      }

      setSubmitError(getSubmitErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCancel(): void {
    router.push("/users");
  }

  if (authStatus === "authenticated" && user && !hasAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Esta operación requiere permisos de administración."
      >
        <StatePanel
          title="No puede crear usuarios"
          message="Solicite a una persona administradora que revise los permisos de su usuario."
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

  return (
    <AppShell
      title="Nuevo usuario"
      description="Cree una cuenta de acceso al sistema."
    >
      <UserForm
        mode="create"
        initialValues={EMPTY_USER_FORM_VALUES}
        isSubmitting={isSubmitting}
        submitError={submitError}
        serverErrors={serverErrors}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </AppShell>
  );
}
