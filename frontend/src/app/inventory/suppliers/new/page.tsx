"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canWriteSuppliers } from "@/features/auth/permissions";
import { createSupplier } from "@/features/inventory/suppliers/api";
import { mapSupplierApiFieldErrors } from "@/features/inventory/suppliers/form-errors";
import { SupplierForm } from "@/features/inventory/suppliers/supplier-form";
import {
  buildSupplierWritePayload,
  EMPTY_SUPPLIER_FORM_VALUES,
  type SupplierFormErrors,
  type SupplierFormValues,
} from "@/features/inventory/suppliers/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La creación del proveedor tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local. Revise el estado del sistema e inténtelo nuevamente.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible crear el proveedor.";
}

export default function NewSupplierPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<SupplierFormErrors>({});

  const hasWriteAccess = user ? canWriteSuppliers(user) : false;

  async function handleSubmit(values: SupplierFormValues): Promise<void> {
    if (!token || isSubmitting || !hasWriteAccess) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      const supplier = await createSupplier(token, buildSupplierWritePayload(values));

      router.replace(`/inventory/suppliers/${supplier.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setSubmitError("Este usuario no tiene permisos para crear proveedores.");
        return;
      }

      if (error instanceof ApiError && error.status === 400) {
        const mappedErrors = mapSupplierApiFieldErrors(error.fieldErrors);

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
    router.push("/inventory/suppliers");
  }

  if (authStatus === "authenticated" && user && !hasWriteAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Esta operación requiere permisos de escritura en proveedores."
      >
        <StatePanel
          title="No puede crear proveedores"
          message="Su usuario puede consultar proveedores, pero no modificarlos."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/inventory/suppliers");
              }}
            >
              Volver a proveedores
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Nuevo proveedor"
      description="Registre una empresa que suministra productos al laboratorio."
    >
      <SupplierForm
        mode="create"
        initialValues={EMPTY_SUPPLIER_FORM_VALUES}
        isSubmitting={isSubmitting}
        submitError={submitError}
        serverErrors={serverErrors}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </AppShell>
  );
}
