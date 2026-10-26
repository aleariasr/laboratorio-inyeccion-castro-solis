"use client";

import { useDialogCreate } from "@/components/forms/use-dialog-create";
import { Dialog } from "@/components/ui/dialog";

import { createSupplier } from "./api";
import { mapSupplierApiFieldErrors } from "./form-errors";
import { SupplierForm } from "./supplier-form";
import {
  buildSupplierWritePayload,
  EMPTY_SUPPLIER_FORM_VALUES,
  type Supplier,
  type SupplierFormValues,
} from "./types";

type CreateSupplierDialogProps = {
  open: boolean;
  token: string;
  /** Lo escrito en el buscador: abre como nombre del proveedor. */
  initialName?: string;
  onClose: () => void;
  onCreated: (supplier: Supplier) => void;
};

/** "Nuevo" proveedor desde la compra (punto 7). */
export function CreateSupplierDialog({
  open,
  token,
  initialName = "",
  onClose,
  onCreated,
}: CreateSupplierDialogProps) {
  const dialogCreate = useDialogCreate({
    create: (values: SupplierFormValues) =>
      createSupplier(token, buildSupplierWritePayload(values)),
    mapFieldErrors: mapSupplierApiFieldErrors,
    fallbackMessage: "No fue posible crear el proveedor.",
    onCreated,
  });

  function close(): void {
    dialogCreate.reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      title="Nuevo proveedor"
      description="Queda en el catálogo de proveedores y elegido para esta compra."
      onClose={() => {
        if (dialogCreate.confirmDiscard()) {
          close();
        }
      }}
    >
      <SupplierForm
        mode="create"
        embedded
        initialValues={{ ...EMPTY_SUPPLIER_FORM_VALUES, name: initialName.trim() }}
        isSubmitting={dialogCreate.isSubmitting}
        submitError={dialogCreate.submitError}
        serverErrors={dialogCreate.serverErrors}
        onSubmit={dialogCreate.submit}
        onCancel={close}
        onDirtyChange={dialogCreate.setDirty}
      />
    </Dialog>
  );
}
