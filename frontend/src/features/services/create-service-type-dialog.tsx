"use client";

import { useDialogCreate } from "@/components/forms/use-dialog-create";
import { Dialog } from "@/components/ui/dialog";

import { createServiceType } from "./api";
import { mapServiceTypeApiFieldErrors } from "./form-errors";
import { ServiceTypeForm } from "./service-type-form";
import {
  buildServiceTypeWritePayload,
  EMPTY_SERVICE_TYPE_FORM_VALUES,
  type ServiceTypeDetail,
  type ServiceTypeFormValues,
} from "./types";

type CreateServiceTypeDialogProps = {
  open: boolean;
  token: string;
  /** Para qué queda elegido: "esta línea", "esta recepción"… */
  purpose: string;
  onClose: () => void;
  onCreated: (serviceType: ServiceTypeDetail) => void;
};

/**
 * "+ Nuevo tipo de servicio…" desde el cobro o la recepción de un servicio
 * (punto 7). Solo el Administrador, que es quien define los tipos.
 */
export function CreateServiceTypeDialog({
  open,
  token,
  purpose,
  onClose,
  onCreated,
}: CreateServiceTypeDialogProps) {
  const dialogCreate = useDialogCreate({
    create: (values: ServiceTypeFormValues) =>
      createServiceType(token, buildServiceTypeWritePayload(values)),
    mapFieldErrors: mapServiceTypeApiFieldErrors,
    fallbackMessage: "No fue posible crear el tipo de servicio.",
    onCreated,
  });

  function close(): void {
    dialogCreate.reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      title="Nuevo tipo de servicio"
      description={`Queda en el catálogo y elegido para ${purpose}, con su precio de mano de obra.`}
      onClose={() => {
        if (!dialogCreate.isSubmitting && dialogCreate.confirmDiscard()) {
          close();
        }
      }}
    >
      <ServiceTypeForm
        mode="create"
        embedded
        initialValues={EMPTY_SERVICE_TYPE_FORM_VALUES}
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
