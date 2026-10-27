"use client";

import { useState, type FormEvent } from "react";

import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/errors";
import { confirmWithFocusRestore } from "@/lib/dom/confirm-with-focus-restore";

type NameCreateDialogProps<TResult> = {
  open: boolean;
  title: string;
  description: string;
  submitLabel: string;
  maxLength: number;
  create: (name: string) => Promise<TResult>;
  onCreated: (result: TResult) => void;
  onClose: () => void;
};

/**
 * Ventana para crear algo que solo lleva nombre (una sede, una categoría
 * de costo) desde el selector de un formulario (punto 7). Mismo
 * comportamiento que las demás ventanas: foco en el nombre, Enter crea,
 * y cerrar con algo escrito pregunta antes de descartarlo.
 */
export function NameCreateDialog<TResult>({
  open,
  title,
  description,
  submitLabel,
  maxLength,
  create,
  onCreated,
  onClose,
}: NameCreateDialogProps<TResult>) {
  const [name, setName] = useState("");

  function close(): void {
    if (
      name.trim() &&
      !confirmWithFocusRestore("Hay cambios sin guardar. ¿Desea salir y descartarlos?")
    ) {
      return;
    }

    setName("");
    onClose();
  }

  return (
    <Dialog open={open} title={title} description={description} onClose={close}>
      <NameCreateForm
        name={name}
        onNameChange={setName}
        submitLabel={submitLabel}
        maxLength={maxLength}
        create={create}
        onCreated={(result) => {
          setName("");
          onCreated(result);
        }}
        onCancel={close}
      />
    </Dialog>
  );
}

function NameCreateForm<TResult>({
  name,
  onNameChange,
  submitLabel,
  maxLength,
  create,
  onCreated,
  onCancel,
}: {
  name: string;
  onNameChange: (name: string) => void;
  submitLabel: string;
  maxLength: number;
  create: (name: string) => Promise<TResult>;
  onCreated: (result: TResult) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      onCreated(await create(name.trim()));
    } catch (submitError: unknown) {
      setError(
        submitError instanceof ApiError ? submitError.message : "No fue posible crearlo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      noValidate
      className="grid gap-5"
    >
      <Field id="name-create-name" label="Nombre" required error={error ?? undefined}>
        <Input
          id="name-create-name"
          value={name}
          onChange={(event) => {
            onNameChange(event.target.value);
            setError(null);
          }}
          hasError={Boolean(error)}
          maxLength={maxLength}
          autoComplete="off"
          disabled={isSubmitting}
        />
      </Field>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>

        <Button type="submit" isLoading={isSubmitting} loadingText="Creando…">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
