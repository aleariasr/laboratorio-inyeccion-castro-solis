"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canWriteInventory } from "@/features/auth/permissions";
import { getSupplier, updateSupplier } from "@/features/inventory/suppliers/api";
import { mapSupplierApiFieldErrors } from "@/features/inventory/suppliers/form-errors";
import { SupplierForm } from "@/features/inventory/suppliers/supplier-form";
import {
  buildSupplierWritePayload,
  supplierToFormValues,
  type Supplier,
  type SupplierFormErrors,
  type SupplierFormValues,
} from "@/features/inventory/suppliers/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      supplier: null;
      message: null;
    }
  | {
      status: "success";
      supplier: Supplier;
      message: null;
    }
  | {
      status: "not-found" | "forbidden" | "error";
      supplier: null;
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

  return "No fue posible consultar el proveedor.";
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

export default function EditSupplierPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    supplier: null,
    message: null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<SupplierFormErrors>({});

  const supplierId = Number(params.id);

  const hasWriteAccess = user ? canWriteInventory(user) : false;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasWriteAccess ||
      !Number.isInteger(supplierId) ||
      supplierId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    getSupplier(token, supplierId, controller.signal)
      .then((supplier) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", supplier, message: null });
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
            supplier: null,
            message: "Este usuario no tiene permisos para editar proveedores.",
          });

          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setLoadState({
            status: "not-found",
            supplier: null,
            message: "El proveedor solicitado no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          supplier: null,
          message: getLoadErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasWriteAccess, logout, router, supplierId, token]);

  async function handleSubmit(values: SupplierFormValues): Promise<void> {
    if (!token || isSubmitting || loadState.status !== "success") {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      await updateSupplier(token, loadState.supplier.id, buildSupplierWritePayload(values));

      router.replace(`/inventory/suppliers/${loadState.supplier.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setSubmitError("Este usuario no tiene permisos para editar proveedores.");
        return;
      }

      if (error instanceof ApiError && error.status === 404) {
        setSubmitError("El proveedor ya no existe o dejó de estar disponible.");
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

  function returnToSupplierDetail(): void {
    router.push(`/inventory/suppliers/${supplierId}`);
  }

  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    return (
      <AppShell
        title="Proveedor no válido"
        description="La dirección proporcionada no identifica un proveedor."
      >
        <StatePanel
          title="Identificador incorrecto"
          message="Regrese al listado y seleccione un proveedor válido."
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

  if (authStatus === "authenticated" && user && !hasWriteAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Esta operación requiere permisos de escritura en inventario."
      >
        <StatePanel
          title="No puede editar proveedores"
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
      title={loadState.status === "success" ? `Editar ${loadState.supplier.name}` : "Editar proveedor"}
      description={
        loadState.status === "success"
          ? loadState.supplier.country || "Empresa que suministra productos al laboratorio."
          : "Modifique la información registrada del proveedor."
      }
    >
      {loadState.status === "loading" && <LoadingState message="Consultando proveedor…" />}

      {loadState.status === "forbidden" && (
        <StatePanel
          title="Acceso restringido"
          message={loadState.message}
          tone="warning"
          action={
            <Button type="button" variant="secondary" onClick={returnToSupplierDetail}>
              Volver al detalle
            </Button>
          }
        />
      )}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Proveedor no encontrado"
          message={loadState.message}
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
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar el proveedor"
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
        <SupplierForm
          key={loadState.supplier.id}
          mode="edit"
          initialValues={supplierToFormValues(loadState.supplier)}
          isSubmitting={isSubmitting}
          submitError={submitError}
          serverErrors={serverErrors}
          onSubmit={handleSubmit}
          onCancel={returnToSupplierDetail}
        />
      )}
    </AppShell>
  );
}
