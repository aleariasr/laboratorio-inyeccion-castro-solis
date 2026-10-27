"use client";

import { useDialogCreate } from "@/components/forms/use-dialog-create";
import { Dialog } from "@/components/ui/dialog";

import { createInjector } from "./api";
import { mapInjectorApiFieldErrors } from "./form-errors";
import { InjectorForm } from "./injector-form";
import {
  buildInjectorWritePayload,
  EMPTY_INJECTOR_FORM_VALUES,
  type Injector,
  type InjectorFormValues,
} from "./types";

type CreateInjectorDialogProps = {
  open: boolean;
  token: string;
  /** El cliente ya elegido en la recepción: el inyector es suyo. */
  customer: { id: number; label: string };
  onClose: () => void;
  onCreated: (injector: Injector) => void;
};

/** "+ Nuevo inyector" de un cliente, desde la recepción del servicio (punto 1C). */
export function CreateInjectorDialog({
  open,
  token,
  customer,
  onClose,
  onCreated,
}: CreateInjectorDialogProps) {
  const dialogCreate = useDialogCreate({
    create: (values: InjectorFormValues) =>
      createInjector(token, buildInjectorWritePayload(values)),
    mapFieldErrors: mapInjectorApiFieldErrors,
    fallbackMessage: "No fue posible crear el inyector.",
    onCreated,
  });

  function close(): void {
    dialogCreate.reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      title="Nuevo inyector"
      description={`Queda registrado a nombre de ${customer.label} y elegido para esta recepción.`}
      onClose={() => {
        if (dialogCreate.confirmDiscard()) {
          close();
        }
      }}
    >
      <InjectorForm
        mode="create"
        embedded
        canReadCustomers
        token={token}
        fixedCustomerLabel={customer.label}
        initialValues={{ ...EMPTY_INJECTOR_FORM_VALUES, customerId: String(customer.id) }}
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
