"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { CREATE_OPTION_VALUE } from "@/components/forms/create-option";
import { Field } from "@/components/forms/field";
import { NameCreateDialog } from "@/components/forms/name-create-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/errors";
import { confirmWithFocusRestore } from "@/lib/dom/confirm-with-focus-restore";
import { isFormShortcutTarget } from "@/lib/dom/form-shortcuts";

import { createBranch, getActiveBranches } from "./api";
import {
  validateStockTransferForm,
  type Branch,
  type StockTransferFormErrors,
  type StockTransferFormValues,
} from "./types";

const SELECT_CLASSES =
  "h-12 w-full min-w-0 rounded-[var(--radius-md)] border bg-surface px-4 text-[15px] text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)] disabled:cursor-not-allowed disabled:bg-surface-muted";

type StockTransferFormProps = {
  mode: "create" | "edit";
  token: string;
  initialValues: StockTransferFormValues;
  isSubmitting: boolean;
  submitError: string | null;
  serverErrors: StockTransferFormErrors;
  onSubmit: (values: StockTransferFormValues) => void | Promise<void>;
  onCancel: () => void;
};

/**
 * Datos del traslado (punto 6): sede de destino, fecha y notas. La sede se
 * elige del catálogo; "+ Nueva sede…", al final de la lista, la crea en
 * una ventana encima y queda
 * elegida, sin perder lo escrito.
 */
export function StockTransferForm({
  mode,
  token,
  initialValues,
  isSubmitting,
  submitError,
  serverErrors,
  onSubmit,
  onCancel,
}: StockTransferFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState(initialValues);

  // Punto de partida para saber si hay cambios: la sede que se elige sola
  // (cuando hay una sola) no es un cambio de la persona.
  const [baseline, setBaseline] = useState(initialValues);

  const isDirty =
    values.branchId !== baseline.branchId ||
    values.transferDate !== baseline.transferDate ||
    values.notes !== baseline.notes;

  const [localErrors, setLocalErrors] = useState<StockTransferFormErrors>({});

  const [branches, setBranches] = useState<Branch[] | null>(null);

  const [branchesError, setBranchesError] = useState<string | null>(null);

  const [isBranchDialogOpen, setIsBranchDialogOpen] = useState(false);

  const errors = { ...serverErrors, ...localErrors };

  useEffect(() => {
    const controller = new AbortController();

    getActiveBranches(token, controller.signal)
      .then((data) => {
        setBranches(data);

        // Con una sola sede (lo normal), queda elegida.
        const selectOnlyBranch = (current: StockTransferFormValues) =>
          !current.branchId && data.length === 1
            ? { ...current, branchId: String(data[0].id) }
            : current;

        setValues(selectOnlyBranch);
        setBaseline(selectOnlyBranch);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setBranchesError(
          error instanceof ApiError ? error.message : "No fue posible consultar las sedes.",
        );
      });

    return () => {
      controller.abort();
    };
  }, [token]);

  useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();

        if (!isSubmitting && isFormShortcutTarget(formRef.current)) {
          formRef.current?.requestSubmit();
        }
      }
    }

    globalThis.addEventListener("keydown", handleSaveShortcut);

    return () => {
      globalThis.removeEventListener("keydown", handleSaveShortcut);
    };
  }, [isSubmitting]);

  function handleCancel(): void {
    if (
      isDirty &&
      !confirmWithFocusRestore("Hay cambios sin guardar. ¿Desea salir y descartarlos?")
    ) {
      return;
    }

    onCancel();
  }

  function updateValue(field: keyof StockTransferFormValues, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
    setLocalErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validateStockTransferForm(values);

    setLocalErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    void onSubmit(values);
  }

  function handleBranchCreated(branch: Branch): void {
    setBranches((current) =>
      [...(current ?? []), branch].sort((a, b) => a.name.localeCompare(b.name, "es")),
    );
    updateValue("branchId", String(branch.id));
    setIsBranchDialogOpen(false);
  }

  return (
    <>
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="grid gap-6">
        {submitError && <FormError message={submitError} />}

        <section className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]">
          <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
              Datos del traslado
            </h2>

            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              La mercadería sale del inventario al confirmar el traslado, no antes.
            </p>
          </div>

          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
            <Field
              id="stock-transfer-branch"
              label="Sede de destino"
              required
              error={errors.branchId ?? branchesError ?? undefined}
            >
              <select
                id="stock-transfer-branch"
                value={values.branchId}
                onChange={(event) => {
                  if (event.target.value === CREATE_OPTION_VALUE) {
                    setIsBranchDialogOpen(true);
                    return;
                  }

                  updateValue("branchId", event.target.value);
                }}
                disabled={isSubmitting || branches === null}
                aria-invalid={Boolean(errors.branchId) || undefined}
                className={`${SELECT_CLASSES} ${errors.branchId ? "border-danger" : "border-border"}`}
              >
                <option value="">
                  {branches === null ? "Consultando sedes…" : "Elija una sede"}
                </option>

                {branches?.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}

                {branches !== null && (
                  <option value={CREATE_OPTION_VALUE}>+ Nueva sede…</option>
                )}
              </select>
            </Field>

            <Field
              id="stock-transfer-date"
              label="Fecha del traslado"
              required
              error={errors.transferDate}
            >
              <Input
                id="stock-transfer-date"
                type="date"
                value={values.transferDate}
                onChange={(event) => {
                  updateValue("transferDate", event.target.value);
                }}
                hasError={Boolean(errors.transferDate)}
                disabled={isSubmitting}
              />
            </Field>

            <div className="lg:col-span-2">
              <Field
                id="stock-transfer-notes"
                label="Notas"
                hint="Salen en la guía de traslado; por ejemplo, quién lo lleva o para qué es."
                error={errors.notes}
              >
                <Textarea
                  id="stock-transfer-notes"
                  value={values.notes}
                  onChange={(event) => {
                    updateValue("notes", event.target.value);
                  }}
                  hasError={Boolean(errors.notes)}
                  disabled={isSubmitting}
                />
              </Field>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-[var(--color-border-soft)] p-5 sm:flex-row sm:justify-end sm:p-6">
            <Button type="button" variant="secondary" onClick={handleCancel} disabled={isSubmitting}>
              Cancelar
            </Button>

            <Button
              type="submit"
              isLoading={isSubmitting}
              loadingText={mode === "create" ? "Creando…" : "Guardando…"}
            >
              <span>{mode === "create" ? "Crear traslado" : "Guardar cambios"}</span>

              {!isSubmitting && <KeyboardShortcut keys={["Ctrl", "S"]} />}
            </Button>
          </div>
        </section>
      </form>

      <NameCreateDialog
        open={isBranchDialogOpen}
        title="Nueva sede"
        description="Queda en el catálogo de sedes y elegida para este traslado."
        submitLabel="Crear sede"
        maxLength={100}
        create={(name) => createBranch(token, name)}
        onCreated={handleBranchCreated}
        onClose={() => {
          setIsBranchDialogOpen(false);
        }}
      />
    </>
  );
}
