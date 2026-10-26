"use client";

import { useEffect, useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/errors";

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
 * elige del catálogo; "Nueva" la crea en una ventana encima y queda
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
  const [values, setValues] = useState(initialValues);

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
        setValues((current) =>
          !current.branchId && data.length === 1
            ? { ...current, branchId: String(data[0].id) }
            : current,
        );
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
      <form onSubmit={handleSubmit} noValidate className="grid gap-6">
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
              <div className="flex gap-2">
                <select
                  id="stock-transfer-branch"
                  value={values.branchId}
                  onChange={(event) => {
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
                </select>

                <Button
                  type="button"
                  variant="secondary"
                  className="h-12 shrink-0"
                  onClick={() => {
                    setIsBranchDialogOpen(true);
                  }}
                  disabled={isSubmitting}
                >
                  Nueva
                </Button>
              </div>
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
            <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
              Cancelar
            </Button>

            <Button
              type="submit"
              isLoading={isSubmitting}
              loadingText={mode === "create" ? "Creando…" : "Guardando…"}
            >
              {mode === "create" ? "Crear traslado" : "Guardar cambios"}
            </Button>
          </div>
        </section>
      </form>

      <Dialog
        open={isBranchDialogOpen}
        title="Nueva sede"
        description="Queda en el catálogo de sedes y elegida para este traslado."
        onClose={() => {
          setIsBranchDialogOpen(false);
        }}
      >
        <BranchForm
          token={token}
          onCreated={handleBranchCreated}
          onCancel={() => {
            setIsBranchDialogOpen(false);
          }}
        />
      </Dialog>
    </>
  );
}

function BranchForm({
  token,
  onCreated,
  onCancel,
}: {
  token: string;
  onCreated: (branch: Branch) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");

  const [error, setError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!name.trim()) {
      setError("Escriba el nombre de la sede.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      onCreated(await createBranch(token, name.trim()));
    } catch (submitError: unknown) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : "No fue posible crear la sede.",
      );
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
      <Field id="branch-name" label="Nombre" required error={error ?? undefined}>
        <Input
          id="branch-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          hasError={Boolean(error)}
          maxLength={100}
          autoComplete="off"
          autoFocus
          disabled={isSubmitting}
        />
      </Field>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>

        <Button type="submit" isLoading={isSubmitting} loadingText="Creando…">
          Crear sede
        </Button>
      </div>
    </form>
  );
}
