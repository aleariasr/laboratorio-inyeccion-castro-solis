"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canWriteCash } from "@/features/auth/permissions";
import { createCashClosing } from "@/features/cash/api";
import { CashClosingForm } from "@/features/cash/cash-closing-form";
import { mapCashClosingApiFieldErrors } from "@/features/cash/form-errors";
import {
  buildCashClosingWritePayload,
  EMPTY_CASH_CLOSING_FORM_VALUES,
  type CashClosingFormErrors,
  type CashClosingFormValues,
} from "@/features/cash/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "El cierre de caja tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local. Revise el estado del sistema e inténtelo nuevamente.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible crear el cierre de caja.";
}

export default function NewCashClosingPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<CashClosingFormErrors>({});

  const hasWriteAccess = user ? canWriteCash(user) : false;

  async function handleSubmit(values: CashClosingFormValues): Promise<void> {
    if (!token || isSubmitting || !hasWriteAccess) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      const closing = await createCashClosing(
        token,
        buildCashClosingWritePayload(values),
      );

      router.replace(`/cash/${closing.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setSubmitError("Este usuario no tiene permisos para cerrar caja.");
        return;
      }

      if (error instanceof ApiError && error.status === 400) {
        const mappedErrors = mapCashClosingApiFieldErrors(error.fieldErrors);

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
    router.push("/cash");
  }

  if (authStatus === "authenticated" && user && !hasWriteAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Esta operación requiere permisos de caja."
      >
        <StatePanel
          title="No puede cerrar caja"
          message="Solicite a una persona administradora que revise los permisos de su usuario."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/cash");
              }}
            >
              Volver a caja
            </Button>
          }
        />
      </AppShell>
    );
  }

  if (!token) {
    return null;
  }

  return (
    <AppShell
      title="Nuevo cierre de caja"
      description="El total esperado se calcula y queda fijo al crear el cierre."
    >
      <CashClosingForm
        initialValues={EMPTY_CASH_CLOSING_FORM_VALUES}
        token={token}
        isSubmitting={isSubmitting}
        submitError={submitError}
        serverErrors={serverErrors}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </AppShell>
  );
}
