"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canWritePurchases } from "@/features/auth/permissions";
import { createPurchase } from "@/features/inventory/purchases/api";
import { mapPurchaseApiFieldErrors } from "@/features/inventory/purchases/form-errors";
import { PurchaseForm } from "@/features/inventory/purchases/purchase-form";
import {
  buildPurchaseWritePayload,
  EMPTY_PURCHASE_FORM_VALUES,
  type PurchaseFormErrors,
  type PurchaseFormValues,
} from "@/features/inventory/purchases/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La creación de la compra tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local. Revise el estado del sistema e inténtelo nuevamente.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible crear la compra.";
}

export default function NewPurchasePage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<PurchaseFormErrors>({});

  const hasWriteAccess = user ? canWritePurchases(user) : false;

  async function handleSubmit(values: PurchaseFormValues): Promise<void> {
    if (!token || isSubmitting || !hasWriteAccess) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      const purchase = await createPurchase(token, buildPurchaseWritePayload(values));

      router.replace(`/inventory/purchases/${purchase.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setSubmitError("Este usuario no tiene permisos para crear compras.");
        return;
      }

      if (error instanceof ApiError && error.status === 400) {
        const mappedErrors = mapPurchaseApiFieldErrors(error.fieldErrors);

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
    router.push("/inventory/purchases");
  }

  if (authStatus === "authenticated" && user && !hasWriteAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Esta operación requiere permisos de escritura en compras."
      >
        <StatePanel
          title="No puede crear compras"
          message="Su usuario puede consultar compras, pero no registrarlas."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/inventory/purchases");
              }}
            >
              Volver a compras
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
      title="Nueva compra"
      description="Registre una factura de compra a un proveedor."
    >
      <PurchaseForm
        mode="create"
        initialValues={EMPTY_PURCHASE_FORM_VALUES}
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
