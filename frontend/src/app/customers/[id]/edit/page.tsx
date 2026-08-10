"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canWriteCustomers } from "@/features/auth/permissions";
import { getCustomer, updateCustomer } from "@/features/customers/api";
import { CustomerForm } from "@/features/customers/customer-form";
import { mapCustomerApiFieldErrors } from "@/features/customers/form-errors";
import {
  buildCustomerWritePayload,
  customerToFormValues,
  type Customer,
  type CustomerFormErrors,
  type CustomerFormValues,
} from "@/features/customers/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      customer: null;
      message: null;
    }
  | {
      status: "success";
      customer: Customer;
      message: null;
    }
  | {
      status: "not-found" | "forbidden" | "error";
      customer: null;
      message: string;
    };

function getLoadErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La consulta tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible consultar el cliente.";
}

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La actualización tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local. Revise el estado del sistema e inténtelo nuevamente.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible guardar los cambios.";
}

export default function EditCustomerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    customer: null,
    message: null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<CustomerFormErrors>({});

  const customerId = Number(params.id);

  const hasWriteAccess = user ? canWriteCustomers(user) : false;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasWriteAccess ||
      !Number.isInteger(customerId) ||
      customerId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    getCustomer(token, customerId, controller.signal)
      .then((customer) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", customer, message: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          void logout().then(() => {
            router.replace("/login");
          });

          return;
        }

        if (error instanceof ApiError && error.status === 403) {
          setLoadState({
            status: "forbidden",
            customer: null,
            message: "Este usuario no tiene permisos para editar clientes.",
          });

          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setLoadState({
            status: "not-found",
            customer: null,
            message: "El cliente solicitado no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          customer: null,
          message: getLoadErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, customerId, hasWriteAccess, logout, router, token]);

  async function handleSubmit(values: CustomerFormValues): Promise<void> {
    if (!token || isSubmitting || loadState.status !== "success") {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      await updateCustomer(token, loadState.customer.id, buildCustomerWritePayload(values));

      router.replace(`/customers/${loadState.customer.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setSubmitError("Este usuario no tiene permisos para editar clientes.");
        return;
      }

      if (error instanceof ApiError && error.status === 404) {
        setSubmitError("El cliente ya no existe o dejó de estar disponible.");
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

  function returnToCustomerDetail(): void {
    router.push(`/customers/${customerId}`);
  }

  if (!Number.isInteger(customerId) || customerId <= 0) {
    return (
      <AppShell
        title="Cliente no válido"
        description="La dirección proporcionada no identifica un cliente."
      >
        <StatePanel
          title="Identificador incorrecto"
          message="Regrese al listado y seleccione un cliente válido."
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

  if (authStatus === "authenticated" && user && !hasWriteAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Esta operación requiere permisos de escritura en clientes."
      >
        <StatePanel
          title="No puede editar clientes"
          message="Su usuario puede consultar clientes, pero no modificarlos."
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
      title={
        loadState.status === "success"
          ? `Editar ${loadState.customer.display_name}`
          : "Editar cliente"
      }
      description={
        loadState.status === "success"
          ? "Modifique la información registrada del cliente."
          : "Modifique la información registrada del cliente."
      }
    >
      {loadState.status === "loading" && <LoadingState message="Consultando cliente…" />}

      {loadState.status === "forbidden" && (
        <StatePanel
          title="Acceso restringido"
          message={loadState.message}
          tone="warning"
          action={
            <Button type="button" variant="secondary" onClick={returnToCustomerDetail}>
              Volver al detalle
            </Button>
          }
        />
      )}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Cliente no encontrado"
          message={loadState.message}
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
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar el cliente"
          message={loadState.message}
          tone="error"
          action={
            <Button
              type="button"
              onClick={() => {
                globalThis.location.reload();
              }}
            >
              Reintentar
            </Button>
          }
        />
      )}

      {loadState.status === "success" && (
        <CustomerForm
          key={loadState.customer.id}
          mode="edit"
          initialValues={customerToFormValues(loadState.customer)}
          isSubmitting={isSubmitting}
          submitError={submitError}
          serverErrors={serverErrors}
          onSubmit={handleSubmit}
          onCancel={returnToCustomerDetail}
        />
      )}
    </AppShell>
  );
}
