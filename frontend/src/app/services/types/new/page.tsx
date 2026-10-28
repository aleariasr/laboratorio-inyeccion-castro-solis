"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canPriceServices } from "@/features/auth/permissions";
import { createServiceType } from "@/features/services/api";
import { mapServiceTypeApiFieldErrors } from "@/features/services/form-errors";
import { ServiceTypeForm } from "@/features/services/service-type-form";
import {
  EMPTY_SERVICE_TYPE_FORM_VALUES,
  buildServiceTypeWritePayload,
  type ServiceTypeFormErrors,
  type ServiceTypeFormValues,
} from "@/features/services/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";
import { goBackOr } from "@/lib/navigation/go-back";

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La creación tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible crear el tipo de servicio.";
}

export default function NewServiceTypePage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<ServiceTypeFormErrors>({});

  const hasAccess = user ? canPriceServices(user) : false;

  function returnToList(): void {
    goBackOr(router, "/services/types");
  }

  async function handleSubmit(values: ServiceTypeFormValues): Promise<void> {
    if (!token || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      await createServiceType(token, buildServiceTypeWritePayload(values));
      returnToList();
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 400) {
        setServerErrors(mapServiceTypeApiFieldErrors(error.fieldErrors));
      }

      setSubmitError(getSubmitErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (authStatus === "authenticated" && user && !hasAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Los tipos de servicio y sus precios los administra el Administrador."
      >
        <StatePanel
          title="No puede crear tipos de servicio"
          message="Los permisos de cada usuario los asigna el Administrador."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/services");
              }}
            >
              Volver a servicios
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Nuevo tipo de servicio"
      description="Precio de mano de obra y qué incluye."
    >
      <ServiceTypeForm
        mode="create"
        initialValues={EMPTY_SERVICE_TYPE_FORM_VALUES}
        isSubmitting={isSubmitting}
        submitError={submitError}
        serverErrors={serverErrors}
        onSubmit={handleSubmit}
        onCancel={returnToList}
      />
    </AppShell>
  );
}
