"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canReadCustomers, canWriteSales } from "@/features/auth/permissions";
import { getSale, updateSale } from "@/features/sales/api";
import { mapSaleApiFieldErrors } from "@/features/sales/form-errors";
import { SaleForm } from "@/features/sales/sale-form";
import {
  buildSaleWritePayload,
  saleToFormValues,
  type Sale,
  type SaleFormErrors,
  type SaleFormValues,
} from "@/features/sales/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      sale: null;
      message: null;
    }
  | {
      status: "success";
      sale: Sale;
      message: null;
    }
  | {
      status: "not-found" | "forbidden" | "error";
      sale: null;
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

  return "No fue posible consultar la venta.";
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

export default function EditSalePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    sale: null,
    message: null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<SaleFormErrors>({});

  const saleId = Number(params.id);

  const hasWriteAccess = user ? canWriteSales(user) : false;

  const hasCustomersAccess = user ? canReadCustomers(user) : false;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasWriteAccess ||
      !Number.isInteger(saleId) ||
      saleId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    getSale(token, saleId, controller.signal)
      .then((sale) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", sale, message: null });
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
            sale: null,
            message: "Este usuario no tiene permisos para editar ventas.",
          });

          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setLoadState({
            status: "not-found",
            sale: null,
            message: "La venta solicitada no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          sale: null,
          message: getLoadErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasWriteAccess, logout, saleId, router, token]);

  async function handleSubmit(values: SaleFormValues): Promise<void> {
    if (!token || isSubmitting || loadState.status !== "success") {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      await updateSale(token, loadState.sale.id, buildSaleWritePayload(values));

      router.replace(`/sales/${loadState.sale.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setSubmitError("Este usuario no tiene permisos para editar ventas.");
        return;
      }

      if (error instanceof ApiError && error.status === 404) {
        setSubmitError("La venta ya no existe o dejó de estar disponible.");
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

  function returnToSaleDetail(): void {
    router.push(`/sales/${saleId}`);
  }

  if (!Number.isInteger(saleId) || saleId <= 0) {
    return (
      <AppShell
        title="Venta no válida"
        description="La dirección proporcionada no identifica una venta."
      >
        <StatePanel
          title="Identificador incorrecto"
          message="Regrese al listado y seleccione una venta válida."
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

  if (authStatus === "authenticated" && user && !hasWriteAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Esta operación requiere permisos de escritura en ventas."
      >
        <StatePanel
          title="No puede editar ventas"
          message="Su usuario puede consultar ventas, pero no modificarlas."
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

  return (
    <AppShell
      title={
        loadState.status === "success"
          ? `Editar venta #${loadState.sale.id}`
          : "Editar venta"
      }
      description={
        loadState.status === "success"
          ? loadState.sale.customer_detail?.display_name ?? "Venta de mostrador"
          : "Modifique la información registrada de la venta."
      }
    >
      {loadState.status === "loading" && <LoadingState message="Consultando venta…" />}

      {loadState.status === "forbidden" && (
        <StatePanel
          title="Acceso restringido"
          message={loadState.message}
          tone="warning"
          action={
            <Button type="button" variant="secondary" onClick={returnToSaleDetail}>
              Volver al detalle
            </Button>
          }
        />
      )}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Venta no encontrada"
          message={loadState.message}
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
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar la venta"
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

      {loadState.status === "success" && loadState.sale.status !== "DRAFT" && (
        <StatePanel
          title="Esta venta ya no es editable"
          message="Solo las ventas en borrador pueden modificarse. Las ventas confirmadas o anuladas se conservan sin cambios para trazabilidad."
          tone="warning"
          action={
            <Button type="button" variant="secondary" onClick={returnToSaleDetail}>
              Volver al detalle
            </Button>
          }
        />
      )}

      {loadState.status === "success" && loadState.sale.status === "DRAFT" && token && (
        <SaleForm
          key={loadState.sale.id}
          mode="edit"
          canReadCustomers={hasCustomersAccess}
          initialValues={saleToFormValues(loadState.sale)}
          customerDisplayLabel={loadState.sale.customer_detail?.display_name ?? null}
          token={token}
          isSubmitting={isSubmitting}
          submitError={submitError}
          serverErrors={serverErrors}
          onSubmit={handleSubmit}
          onCancel={returnToSaleDetail}
        />
      )}
    </AppShell>
  );
}
