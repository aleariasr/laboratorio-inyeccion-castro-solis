"use client";

import { useDialogCreate } from "@/components/forms/use-dialog-create";
import { Dialog } from "@/components/ui/dialog";

import { createStorageLocation } from "./api";
import { mapStorageLocationApiFieldErrors } from "./form-errors";
import { LocationForm } from "./location-form";
import {
  buildStorageLocationWritePayload,
  EMPTY_STORAGE_LOCATION_FORM_VALUES,
  type StorageLocation,
} from "./types";

type CreateLocationDialogProps = {
  open: boolean;
  token: string;
  onClose: () => void;
  onCreated: (location: StorageLocation) => void;
};

/** "Nueva" ubicación desde el formulario de producto (punto 7). */
export function CreateLocationDialog({ open, token, onClose, onCreated }: CreateLocationDialogProps) {
  const dialogCreate = useDialogCreate({
    create: (values: typeof EMPTY_STORAGE_LOCATION_FORM_VALUES) =>
      createStorageLocation(token, buildStorageLocationWritePayload(values)),
    mapFieldErrors: mapStorageLocationApiFieldErrors,
    fallbackMessage: "No fue posible crear la ubicación.",
    onCreated,
  });

  function close(): void {
    dialogCreate.reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      title="Nueva ubicación"
      description="Queda en el catálogo de ubicaciones y elegida para este producto."
      onClose={() => {
        if (dialogCreate.confirmDiscard()) {
          close();
        }
      }}
    >
      <LocationForm
        mode="create"
        embedded
        initialValues={EMPTY_STORAGE_LOCATION_FORM_VALUES}
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
