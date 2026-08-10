"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canWriteCustomers } from "@/features/auth/permissions";
import { createCustomer } from "@/features/customers/api";
import { CustomerForm } from "@/features/customers/customer-form";
import { mapCustomerApiFieldErrors } from "@/features/customers/form-errors";
import {
  buildCustomerWritePayload,
  EMPTY_CUSTOMER_FORM_VALUES,
  type CustomerFormErrors,
  type CustomerFormValues,
} from "@/features/customers/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La creación del cliente tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local. Revise el estado del sistema e inténtelo nuevamente.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible crear el cliente.";
}

export default function NewCustomerPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<CustomerFormErrors>({});

  const hasWriteAccess = user ? canWriteCustomers(user) : false;

  async function handleSubmit(values: CustomerFormValues): Promise<void> {
    if (!token || isSubmitting || !hasWriteAccess) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      const customer = await createCustomer(token, buildCustomerWritePayload(values));

      router.replace(`/customers/${customer.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setSubmitError("Este usuario no tiene permisos para crear clientes.");
        return;
      }

      if (error instanceof ApiError && error.status === 400) {
        const mappedErrors = mapCustomerApiFieldErrors(error.fieldErrors);

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
    router.push("/customers");
  }

  if (authStatus === "authenticated" && user && !hasWriteAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Esta operación requiere permisos de escritura en clientes."
      >
        <StatePanel
          title="No puede crear clientes"
          message="Su usuario puede consultar clientes, pero no registrarlos."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/customers");
              }}
            >
              Volver a clientes
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Nuevo cliente"
      description="Registre un cliente para ventas y servicios."
    >
      <CustomerForm
        mode="create"
        initialValues={EMPTY_CUSTOMER_FORM_VALUES}
        isSubmitting={isSubmitting}
        submitError={submitError}
        serverErrors={serverErrors}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </AppShell>
  );
}
