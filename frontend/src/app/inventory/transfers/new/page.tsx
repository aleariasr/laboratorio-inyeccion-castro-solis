"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canWriteTransfers } from "@/features/auth/permissions";
import { createStockTransfer } from "@/features/inventory/transfers/api";
import { StockTransferForm } from "@/features/inventory/transfers/stock-transfer-form";
import {
  buildStockTransferWritePayload,
  emptyStockTransferFormValues,
  mapStockTransferApiFieldErrors,
  type StockTransferFormErrors,
  type StockTransferFormValues,
} from "@/features/inventory/transfers/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";
import { goBackOr } from "@/lib/navigation/go-back";

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La creación del traslado tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible crear el traslado.";
}

/** Punto 6 del plan del 2026-10-22: se crea el borrador y se sigue en su detalle. */
export default function NewStockTransferPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [initialValues] = useState(emptyStockTransferFormValues);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<StockTransferFormErrors>({});

  const hasWriteAccess = user ? canWriteTransfers(user) : false;

  async function handleSubmit(values: StockTransferFormValues): Promise<void> {
    if (!token || isSubmitting || !hasWriteAccess) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      const transfer = await createStockTransfer(token, buildStockTransferWritePayload(values));

      router.replace(`/inventory/transfers/${transfer.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 400) {
        setServerErrors(mapStockTransferApiFieldErrors(error.fieldErrors));
      }

      setSubmitError(getSubmitErrorMessage(error));
      setIsSubmitting(false);
    }
  }

  if (authStatus === "authenticated" && user && !hasWriteAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Los traslados a otra sede los hace el Administrador."
      >
        <StatePanel
          title="No puede crear traslados"
          message="Los permisos de cada usuario los asigna el Administrador."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/dashboard");
              }}
            >
              Volver al inicio
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
      title="Nuevo traslado"
      description="Mercadería que sale hacia otra sede. Los productos se agregan en el siguiente paso."
    >
      <StockTransferForm
        mode="create"
        token={token}
        initialValues={initialValues}
        isSubmitting={isSubmitting}
        submitError={submitError}
        serverErrors={serverErrors}
        onSubmit={handleSubmit}
        onCancel={() => {
          goBackOr(router, "/inventory/transfers");
        }}
      />
    </AppShell>
  );
}
