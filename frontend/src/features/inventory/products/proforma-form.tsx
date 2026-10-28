"use client";

import { useState, type FormEvent } from "react";

import { DiscountTaxFields } from "@/components/documents/discount-tax-fields";
import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import type { DiscountType } from "@/lib/document-amounts";

import {
  CustomerPicker,
  type SelectedCustomer,
} from "../../sales/customer-picker";
import type { ProformaAmountSettings } from "./api";

type ProformaFormProps = {
  canReadCustomers: boolean;
  // Punto 7: crear el cliente buscado desde la lista sin resultados.
  canCreateCustomers?: boolean;
  token: string;
  isSubmitting?: boolean;
  submitError?: string | null;
  onSubmit: (
    customerId: number | null,
    amountSettings: ProformaAmountSettings,
  ) => void | Promise<void>;
  onCancel: () => void;
};

export function ProformaForm({
  canReadCustomers,
  canCreateCustomers = false,
  token,
  isSubmitting = false,
  submitError = null,
  onSubmit,
  onCancel,
}: ProformaFormProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);

  // Punto 15: mismo descuento e impuesto que la venta; 13 % por defecto.
  // Los montos se ven en el PDF: esta pantalla solo conoce los productos
  // marcados, no sus precios.
  const [discountType, setDiscountType] = useState<DiscountType>("AMOUNT");

  const [discountValue, setDiscountValue] = useState("0");

  const [taxPercentage, setTaxPercentage] = useState("13");

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    void onSubmit(selectedCustomer?.id ?? null, {
      discountType,
      discountValue,
      taxPercentage,
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      {submitError && <FormError message={submitError} />}

      <Field
        id="proforma-customer"
        label="Cliente"
        hint={`Opcional. Búsqueda por nombre, identificación o teléfono${canCreateCustomers ? " (si no existe, se crea desde la lista)" : ""}. Sin cliente, la proforma sale sin sus datos.`}
      >
        <CustomerPicker
          id="proforma-customer"
          canReadCustomers={canReadCustomers}
          canCreateCustomers={canCreateCustomers}
          token={token}
          value={selectedCustomer}
          onChange={setSelectedCustomer}
          disabled={isSubmitting}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <DiscountTaxFields
          idPrefix="products-proforma"
          discountType={discountType}
          discountValue={discountValue}
          taxPercentage={taxPercentage}
          onDiscountTypeChange={setDiscountType}
          onDiscountValueChange={setDiscountValue}
          onTaxPercentageChange={setTaxPercentage}
          disabled={isSubmitting}
        />
      </div>

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
