"use client";

import { useDialogCreate } from "@/components/forms/use-dialog-create";
import { Dialog } from "@/components/ui/dialog";

import { createCustomer } from "./api";
import { CustomerForm } from "./customer-form";
import { mapCustomerApiFieldErrors } from "./form-errors";
import {
  buildCustomerWritePayload,
  EMPTY_CUSTOMER_FORM_VALUES,
  type Customer,
  type CustomerFormValues,
} from "./types";

type CreateCustomerDialogProps = {
  open: boolean;
  token: string;
  /** Para qué queda elegido: "esta venta", "este inyector"… */
  purpose: string;
  /** Lo escrito en el buscador: abre como nombre del cliente. */
  initialName?: string;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
};

/** "Nuevo" cliente desde la venta, la proforma o el inyector (punto 7). */
export function CreateCustomerDialog({
  open,
  token,
  purpose,
  initialName = "",
  onClose,
  onCreated,
}: CreateCustomerDialogProps) {
  const dialogCreate = useDialogCreate({
    create: (values: CustomerFormValues) =>
      createCustomer(token, buildCustomerWritePayload(values)),
    mapFieldErrors: mapCustomerApiFieldErrors,
    fallbackMessage: "No fue posible crear el cliente.",
    onCreated,
  });

  function close(): void {
    dialogCreate.reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      title="Nuevo cliente"
      description={`Queda en el catálogo de clientes y elegido para ${purpose}.`}
      onClose={() => {
        if (dialogCreate.confirmDiscard()) {
          close();
        }
      }}
    >
      <CustomerForm
        mode="create"
        embedded
        initialValues={{ ...EMPTY_CUSTOMER_FORM_VALUES, displayName: initialName.trim() }}
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
