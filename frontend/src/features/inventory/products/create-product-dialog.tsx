"use client";

import { useEffect, useState } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { useDialogCreate } from "@/components/forms/use-dialog-create";
import { Dialog } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/errors";

import { createProduct, getActiveLocations } from "./api";
import { mapProductApiFieldErrors } from "./form-errors";
import { ProductForm } from "./product-form";
import {
  buildProductWritePayload,
  EMPTY_PRODUCT_FORM_VALUES,
  type Product,
  type ProductFormErrors,
  type ProductFormValues,
  type StorageLocationSummary,
} from "./types";

type LocationsState =
  | { status: "loading" }
  | { status: "success"; locations: StorageLocationSummary[] }
  | { status: "error"; message: string };

type CreateProductDialogProps = {
  open: boolean;
  token: string;
  canReadCosts: boolean;
  /** Lo que se escribió en el buscador: si parece un código, lo propone. */
  initialCode?: string;
  /** Para qué queda elegido: "esta línea de compra"… */
  purpose: string;
  onClose: () => void;
  onCreated: (product: Product) => void;
};

/**
 * "Nuevo" producto desde la compra o el producto de proveedor (punto 7).
 * Usa el mismo formulario que la página de producto, en modo ventana;
 * la ubicación se elige de las que ya existen (dentro de una ventana no
 * se abre otra).
 */
export function CreateProductDialog({
  open,
  token,
  canReadCosts,
  initialCode = "",
  purpose,
  onClose,
  onCreated,
}: CreateProductDialogProps) {
  const dialogCreate = useDialogCreate({
    create: (values: ProductFormValues) => createProduct(token, buildProductWritePayload(values)),
    mapFieldErrors: mapProductApiFieldErrors,
    fallbackMessage: "No fue posible crear el producto.",
    onCreated,
  });

  function close(): void {
    dialogCreate.reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      title="Nuevo producto"
      description={`Queda en el catálogo de productos y elegido para ${purpose}.`}
      onClose={close}
    >
      <CreateProductDialogBody
        token={token}
        canReadCosts={canReadCosts}
        initialCode={initialCode}
        dialogCreate={dialogCreate}
        onCancel={close}
      />
    </Dialog>
  );
}

/** Se monta al abrir la ventana: consulta las ubicaciones activas en ese momento. */
function CreateProductDialogBody({
  token,
  canReadCosts,
  initialCode,
  dialogCreate,
  onCancel,
}: {
  token: string;
  canReadCosts: boolean;
  initialCode: string;
  dialogCreate: ReturnType<typeof useDialogCreate<ProductFormValues, ProductFormErrors, Product>>;
  onCancel: () => void;
}) {
  const [locationsState, setLocationsState] = useState<LocationsState>({ status: "loading" });

  // Un código escrito en el buscador (sin espacios) se propone como código
  // estándar; un nombre no.
  const [initialValues] = useState<ProductFormValues>(() => ({
    ...EMPTY_PRODUCT_FORM_VALUES,
    standardCode: /^\S+$/.test(initialCode.trim()) ? initialCode.trim().toUpperCase() : "",
  }));

  useEffect(() => {
    const controller = new AbortController();

    getActiveLocations(token, controller.signal)
      .then((locations) => {
        setLocationsState({ status: "success", locations });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLocationsState({
            status: "error",
            message:
              error instanceof ApiError
                ? error.message
                : "No fue posible consultar las ubicaciones.",
          });
        }
      });

    return () => {
      controller.abort();
    };
  }, [token]);

  if (locationsState.status === "loading") {
    return <LoadingState message="Consultando ubicaciones…" />;
  }

  if (locationsState.status === "error") {
    return (
      <StatePanel
        nested
        title="No se pudieron cargar las ubicaciones"
        message={locationsState.message}
        tone="error"
      />
    );
  }

  if (locationsState.locations.length === 0) {
    return (
      <StatePanel
        nested
        title="No hay ubicaciones activas"
        message="Un producto necesita una ubicación. Se crea primero en Inventario › Ubicaciones."
        tone="warning"
      />
    );
  }

  return (
    <ProductForm
      mode="create"
      embedded
      token={token}
      canReadCosts={canReadCosts}
      initialValues={initialValues}
      locations={locationsState.locations}
      isSubmitting={dialogCreate.isSubmitting}
      submitError={dialogCreate.submitError}
      serverErrors={dialogCreate.serverErrors}
      onSubmit={dialogCreate.submit}
      onCancel={onCancel}
    />
  );
}
