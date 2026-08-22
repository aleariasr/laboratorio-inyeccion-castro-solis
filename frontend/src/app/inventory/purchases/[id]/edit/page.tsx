"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canWritePurchases } from "@/features/auth/permissions";
import { getPurchase, updatePurchase } from "@/features/inventory/purchases/api";
import { mapPurchaseApiFieldErrors } from "@/features/inventory/purchases/form-errors";
import { PurchaseForm } from "@/features/inventory/purchases/purchase-form";
import {
  buildPurchaseWritePayload,
  purchaseToFormValues,
  type Purchase,
  type PurchaseFormErrors,
  type PurchaseFormValues,
} from "@/features/inventory/purchases/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      purchase: null;
      message: null;
    }
  | {
      status: "success";
      purchase: Purchase;
      message: null;
    }
  | {
      status: "not-found" | "forbidden" | "error";
      purchase: null;
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

  return "No fue posible consultar la compra.";
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

export default function EditPurchasePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    purchase: null,
    message: null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<PurchaseFormErrors>({});

  const purchaseId = Number(params.id);

  const hasWriteAccess = user ? canWritePurchases(user) : false;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasWriteAccess ||
      !Number.isInteger(purchaseId) ||
      purchaseId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    getPurchase(token, purchaseId, controller.signal)
      .then((purchase) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", purchase, message: null });
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
            purchase: null,
            message: "Este usuario no tiene permisos para editar compras.",
          });

          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setLoadState({
            status: "not-found",
            purchase: null,
            message: "La compra solicitada no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          purchase: null,
          message: getLoadErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasWriteAccess, logout, purchaseId, router, token]);

  async function handleSubmit(values: PurchaseFormValues): Promise<void> {
    if (!token || isSubmitting || loadState.status !== "success") {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      await updatePurchase(token, loadState.purchase.id, buildPurchaseWritePayload(values));

      router.replace(`/inventory/purchases/${loadState.purchase.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setSubmitError("Este usuario no tiene permisos para editar compras.");
        return;
      }

      if (error instanceof ApiError && error.status === 404) {
        setSubmitError("La compra ya no existe o dejó de estar disponible.");
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

  function returnToPurchaseDetail(): void {
    router.push(`/inventory/purchases/${purchaseId}`);
  }

  if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
    return (
      <AppShell
        title="Compra no válida"
        description="La dirección proporcionada no identifica una compra."
      >
        <StatePanel
          title="Identificador incorrecto"
          message="Regrese al listado y seleccione una compra válida."
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

  if (authStatus === "authenticated" && user && !hasWriteAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Esta operación requiere permisos de escritura en compras."
      >
        <StatePanel
          title="No puede editar compras"
          message="Su usuario puede consultar compras, pero no modificarlas."
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

  return (
    <AppShell
      title={
        loadState.status === "success"
          ? `Editar ${loadState.purchase.invoice_number}`
          : "Editar compra"
      }
      description={
        loadState.status === "success"
          ? loadState.purchase.supplier_detail.name
          : "Modifique la información registrada de la compra."
      }
    >
      {loadState.status === "loading" && <LoadingState message="Consultando compra…" />}

      {loadState.status === "forbidden" && (
        <StatePanel
          title="Acceso restringido"
          message={loadState.message}
          tone="warning"
          action={
            <Button type="button" variant="secondary" onClick={returnToPurchaseDetail}>
              Volver al detalle
            </Button>
          }
        />
      )}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Compra no encontrada"
          message={loadState.message}
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
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar la compra"
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

      {loadState.status === "success" && loadState.purchase.status !== "DRAFT" && (
        <StatePanel
          title="Esta compra ya no es editable"
          message="Solo las compras en borrador pueden modificarse. Las compras confirmadas o anuladas se conservan sin cambios para trazabilidad."
          tone="warning"
          action={
            <Button type="button" variant="secondary" onClick={returnToPurchaseDetail}>
              Volver al detalle
            </Button>
          }
        />
      )}

      {loadState.status === "success" && loadState.purchase.status === "DRAFT" && token && (
        <PurchaseForm
          key={loadState.purchase.id}
          mode="edit"
          initialValues={purchaseToFormValues(loadState.purchase)}
          supplierDisplayLabel={loadState.purchase.supplier_detail.name}
          token={token}
          isSubmitting={isSubmitting}
          submitError={submitError}
          serverErrors={serverErrors}
          onSubmit={handleSubmit}
          onCancel={returnToPurchaseDetail}
        />
      )}
    </AppShell>
  );
}
