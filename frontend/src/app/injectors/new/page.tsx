"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canReadCustomers, canWriteInjectors } from "@/features/auth/permissions";
import { createInjector } from "@/features/injectors/api";
import { mapInjectorApiFieldErrors } from "@/features/injectors/form-errors";
import { InjectorForm } from "@/features/injectors/injector-form";
import {
  buildInjectorWritePayload,
  EMPTY_INJECTOR_FORM_VALUES,
  type InjectorFormErrors,
  type InjectorFormValues,
} from "@/features/injectors/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La creación del inyector tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local. Revise el estado del sistema e inténtelo nuevamente.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible crear el inyector.";
}

export default function NewInjectorPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<InjectorFormErrors>({});

  const hasWriteAccess = user ? canWriteInjectors(user) : false;

  const hasCustomersAccess = user ? canReadCustomers(user) : false;

  async function handleSubmit(values: InjectorFormValues): Promise<void> {
    if (!token || isSubmitting || !hasWriteAccess) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      const injector = await createInjector(token, buildInjectorWritePayload(values));

      router.replace(`/injectors/${injector.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setSubmitError("Este usuario no tiene permisos para crear inyectores.");
        return;
      }

      if (error instanceof ApiError && error.status === 400) {
        const mappedErrors = mapInjectorApiFieldErrors(error.fieldErrors);

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
    router.push("/injectors");
  }

  if (authStatus === "authenticated" && user && !hasWriteAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Esta operación requiere permisos de escritura en inyectores."
      >
        <StatePanel
          title="No puede crear inyectores"
          message="Su usuario puede consultar inyectores, pero no registrarlos."
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

  return (
    <AppShell
      title="Nuevo inyector"
      description="Registre un inyector para un cliente."
    >
      <InjectorForm
        mode="create"
        canReadCustomers={hasCustomersAccess}
        initialValues={EMPTY_INJECTOR_FORM_VALUES}
        token={token ?? ""}
        isSubmitting={isSubmitting}
        submitError={submitError}
        serverErrors={serverErrors}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </AppShell>
  );
}
