"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canWriteCustomers } from "@/features/auth/permissions";
import { createServiceRecord } from "@/features/services/api";
import { mapServiceRecordCreateApiFieldErrors } from "@/features/services/form-errors";
import { ServiceRecordCreateForm } from "@/features/services/service-record-create-form";
import {
  buildServiceRecordCreatePayload,
  type ServiceRecordCreateFormErrors,
  type ServiceRecordCreateFormValues,
} from "@/features/services/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

function nowAsDateTimeLocal(): string {
  const now = new Date();

  now.setSeconds(0, 0);

  const offsetMs = now.getTimezoneOffset() * 60000;

  const local = new Date(now.getTime() - offsetMs);

  return local.toISOString().slice(0, 16);
}

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La recepción del inyector tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local. Revise el estado del sistema e inténtelo nuevamente.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible registrar la recepción.";
}

export default function NewServiceRecordPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<ServiceRecordCreateFormErrors>({});

  const hasWriteAccess = user ? canWriteCustomers(user) : false;

  async function handleSubmit(values: ServiceRecordCreateFormValues): Promise<void> {
    if (!token || isSubmitting || !hasWriteAccess) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      const serviceRecord = await createServiceRecord(
        token,
        buildServiceRecordCreatePayload(values),
      );

      router.replace(`/services/${serviceRecord.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setSubmitError("Este usuario no tiene permisos para recibir inyectores.");
        return;
      }

      if (error instanceof ApiError && error.status === 400) {
        const mappedErrors = mapServiceRecordCreateApiFieldErrors(error.fieldErrors);

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
    router.push("/services");
  }

  if (authStatus === "authenticated" && user && !hasWriteAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Esta operación requiere permisos de escritura en clientes."
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

  return (
    <AppShell
      title="Recibir inyector"
      description="Registre la entrada de un inyector para revisión."
    >
      <ServiceRecordCreateForm
        initialValues={{
          injectorId: "",
          receivedAt: nowAsDateTimeLocal(),
        }}
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
