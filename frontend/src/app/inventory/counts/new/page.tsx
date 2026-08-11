"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canWriteInventory } from "@/features/auth/permissions";
import { createInventoryCount } from "@/features/inventory/counts/api";
import { mapInventoryCountApiFieldErrors } from "@/features/inventory/counts/form-errors";
import { InventoryCountForm } from "@/features/inventory/counts/inventory-count-form";
import {
  buildInventoryCountWritePayload,
  EMPTY_INVENTORY_COUNT_FORM_VALUES,
  type InventoryCountFormErrors,
  type InventoryCountFormValues,
} from "@/features/inventory/counts/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La creación del conteo tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local. Revise el estado del sistema e inténtelo nuevamente.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible crear el conteo.";
}

export default function NewInventoryCountPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<InventoryCountFormErrors>({});

  const hasWriteAccess = user ? canWriteInventory(user) : false;

  async function handleSubmit(values: InventoryCountFormValues): Promise<void> {
    if (!token || isSubmitting || !hasWriteAccess) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      const inventoryCount = await createInventoryCount(
        token,
        buildInventoryCountWritePayload(values),
      );

      router.replace(`/inventory/counts/${inventoryCount.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setSubmitError("Este usuario no tiene permisos para crear conteos.");
        return;
      }

      if (error instanceof ApiError && error.status === 400) {
        const mappedErrors = mapInventoryCountApiFieldErrors(error.fieldErrors);

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
    router.push("/inventory/counts");
  }

  if (authStatus === "authenticated" && user && !hasWriteAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Esta operación requiere permisos de escritura en inventario."
      >
        <StatePanel
          title="No puede crear conteos"
          message="Su usuario puede consultar conteos, pero no registrarlos."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/inventory/counts");
              }}
            >
              Volver a conteos
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
      title="Nuevo conteo"
      description="Registre un conteo físico de inventario."
    >
      <InventoryCountForm
        mode="create"
        initialValues={EMPTY_INVENTORY_COUNT_FORM_VALUES}
        isSubmitting={isSubmitting}
        submitError={submitError}
        serverErrors={serverErrors}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </AppShell>
  );
}
