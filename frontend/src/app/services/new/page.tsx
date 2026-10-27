"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import {
  canCreateCustomers,
  canCreateInjectors,
  canPriceServices,
  canReadCustomers,
  canWriteServices,
} from "@/features/auth/permissions";
import { receiveInjectors } from "@/features/services/api";
import { mapServiceReceptionApiFieldErrors } from "@/features/services/form-errors";
import { ServiceReceptionForm } from "@/features/services/service-reception-form";
import {
  buildServiceReceptionPayload,
  type ServiceReceptionFormErrors,
  type ServiceReceptionFormValues,
} from "@/features/services/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";
import { goBackOr } from "@/lib/navigation/go-back";

function nowAsDateTimeLocal(): string {
  const now = new Date();

  now.setSeconds(0, 0);

  const offsetMs = now.getTimezoneOffset() * 60000;

  const local = new Date(now.getTime() - offsetMs);

  return local.toISOString().slice(0, 16);
}

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La recepción tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible registrar la recepción.";
}

/**
 * Recepción de servicio (punto 1C del plan del 2026-10-22): uno o varios
 * inyectores del mismo cliente. Con uno se sigue en el detalle del
 * servicio; con varios, en la lista, donde quedan arriba.
 */
export default function NewServiceRecordPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [initialValues] = useState<ServiceReceptionFormValues>(() => ({
    customer: null,
    items: [],
    receivedAt: nowAsDateTimeLocal(),
    serviceTypeId: "",
  }));

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<ServiceReceptionFormErrors>({});

  const hasWriteAccess = user ? canWriteServices(user) : false;

  async function handleSubmit(values: ServiceReceptionFormValues): Promise<void> {
    if (!token || isSubmitting || !hasWriteAccess) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      const serviceRecords = await receiveInjectors(token, buildServiceReceptionPayload(values));

      router.replace(
        serviceRecords.length === 1 ? `/services/${serviceRecords[0].id}` : "/services",
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 400) {
        setServerErrors(mapServiceReceptionApiFieldErrors(error.fieldErrors));
      }

      setSubmitError(
        error instanceof ApiError && error.status === 403
          ? "Este usuario no tiene permisos para recibir inyectores."
          : getSubmitErrorMessage(error),
      );
      setIsSubmitting(false);
    }
  }

  if (authStatus === "authenticated" && user && !hasWriteAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Esta operación requiere permisos de escritura en servicios."
      >
        <StatePanel
          title="No puede recibir inyectores"
          message="Su usuario puede consultar servicios, pero no registrarlos."
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

  if (!token || !user) {
    return null;
  }

  return (
    <AppShell
      title="Recibir inyectores"
      description="Uno o varios inyectores de un mismo cliente; se crea un servicio por inyector."
    >
      <ServiceReceptionForm
        token={token}
        initialValues={initialValues}
        canReadCustomers={canReadCustomers(user)}
        canCreateCustomers={canCreateCustomers(user)}
        canCreateInjectors={canCreateInjectors(user)}
        canChooseServiceType={canPriceServices(user)}
        isSubmitting={isSubmitting}
        submitError={submitError}
        serverErrors={serverErrors}
        onSubmit={handleSubmit}
        onCancel={() => {
          goBackOr(router, "/services");
        }}
      />
    </AppShell>
  );
}
