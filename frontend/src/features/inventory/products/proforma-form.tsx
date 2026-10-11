"use client";

import { useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";

import {
  CustomerPicker,
  type SelectedCustomer,
} from "../../sales/customer-picker";

type ProformaFormProps = {
  canReadCustomers: boolean;
  token: string;
  isSubmitting?: boolean;
  submitError?: string | null;
  onSubmit: (customerId: number | null) => void | Promise<void>;
  onCancel: () => void;
};

export function ProformaForm({
  canReadCustomers,
  token,
  isSubmitting = false,
  submitError = null,
  onSubmit,
  onCancel,
}: ProformaFormProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    void onSubmit(selectedCustomer?.id ?? null);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      {submitError && <FormError message={submitError} />}

      <Field
        id="proforma-customer"
        label="Cliente"
        hint="Opcional. Busque por nombre, identificación o teléfono, o déjelo vacío para no incluir datos de cliente."
      >
        <CustomerPicker
          id="proforma-customer"
          canReadCustomers={canReadCustomers}
          token={token}
          value={selectedCustomer}
          onChange={setSelectedCustomer}
          disabled={isSubmitting}
        />
      </Field>

      <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--color-border-soft)] pt-5">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>

        <Button type="submit" isLoading={isSubmitting} loadingText="Generando PDF…">
          Crear proforma
        </Button>
      </div>
    </form>
  );
}
