"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canWriteSales } from "@/features/auth/permissions";
import { createSale } from "@/features/sales/api";
import { mapSaleApiFieldErrors } from "@/features/sales/form-errors";
import { SaleForm } from "@/features/sales/sale-form";
import {
  buildSaleWritePayload,
  EMPTY_SALE_FORM_VALUES,
  type SaleFormErrors,
  type SaleFormValues,
} from "@/features/sales/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La creación de la venta tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local. Revise el estado del sistema e inténtelo nuevamente.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible crear la venta.";
}

export default function NewSalePage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<SaleFormErrors>({});

  const hasWriteAccess = user ? canWriteSales(user) : false;

  async function handleSubmit(values: SaleFormValues): Promise<void> {
    if (!token || isSubmitting || !hasWriteAccess) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      const sale = await createSale(token, buildSaleWritePayload(values));

      router.replace(`/sales/${sale.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setSubmitError("Este usuario no tiene permisos para crear ventas.");
        return;
      }

      if (error instanceof ApiError && error.status === 400) {
        const mappedErrors = mapSaleApiFieldErrors(error.fieldErrors);

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
    router.push("/sales");
  }

  if (authStatus === "authenticated" && user && !hasWriteAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Esta operación requiere permisos de escritura en ventas."
      >
        <StatePanel
          title="No puede crear ventas"
          message="Su usuario puede consultar ventas, pero no registrarlas."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/sales");
              }}
            >
              Volver a ventas
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
      title="Nueva venta"
      description="Registre una venta a un cliente, o de mostrador."
    >
      <SaleForm
        mode="create"
        initialValues={EMPTY_SALE_FORM_VALUES}
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
