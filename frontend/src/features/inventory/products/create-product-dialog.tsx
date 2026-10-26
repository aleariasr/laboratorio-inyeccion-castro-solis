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
  /**
   * Lo escrito en el buscador: si es una sola palabra (un código) abre
   * como código estándar; si tiene espacios, como nombre.
   */
  initialQuery?: string;
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
  initialQuery = "",
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
      onClose={() => {
        if (dialogCreate.confirmDiscard()) {
          close();
        }
      }}
    >
      <CreateProductDialogBody
        token={token}
        canReadCosts={canReadCosts}
        initialQuery={initialQuery}
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
  initialQuery,
  dialogCreate,
  onCancel,
}: {
  token: string;
  canReadCosts: boolean;
  initialQuery: string;
  dialogCreate: ReturnType<typeof useDialogCreate<ProductFormValues, ProductFormErrors, Product>>;
  onCancel: () => void;
}) {
  const [locationsState, setLocationsState] = useState<LocationsState>({ status: "loading" });

  // Lo buscado: una sola palabra es un código; con espacios, un nombre.
  const [initialValues] = useState<ProductFormValues>(() => {
    const query = initialQuery.trim();
    const isCode = /^\S+$/.test(query);

    return {
      ...EMPTY_PRODUCT_FORM_VALUES,
      standardCode: isCode ? query.toUpperCase() : "",
      name: isCode ? "" : query,
    };
  });

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
      onDirtyChange={dialogCreate.setDirty}
    />
  );
}
