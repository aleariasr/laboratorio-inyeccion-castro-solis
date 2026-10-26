"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { formActionsClassName, formSectionClassName } from "@/components/forms/form-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { confirmWithFocusRestore } from "@/lib/dom/confirm-with-focus-restore";
import { isFormShortcutTarget } from "@/lib/dom/form-shortcuts";

import { CreateLocationDialog } from "../locations/create-location-dialog";
import { getLatestProductCostHistory } from "../purchases/api";
import { formatMoney } from "../purchases/format";
import type { ProductCostHistory } from "../purchases/types";

import type {
  ProductFormErrors,
  ProductFormField,
  ProductFormValues,
  StorageLocationSummary,
} from "./types";
import { VARIANT_KIND_OPTIONS } from "./types";
import { validateProductForm } from "./validation";

type ProductFormMode =
  | "create"
  | "edit";

type ProductFormProps = {
  mode: ProductFormMode;
  productId?: number;
  token: string;
  // Sin view_costs el histórico de costos responde 403: no se consulta,
  // y el precio de venta queda de solo lectura (el backend rechaza el
  // cambio, ver ProductSerializer.validate_custom_sale_price).
  canReadCosts?: boolean;
  initialValues: ProductFormValues;
  locations: StorageLocationSummary[];
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: ProductFormErrors;
  onSubmit: (
    values: ProductFormValues,
  ) => void | Promise<void>;
  onCancel: () => void;
  // Punto 7: "Nueva" ubicación en una ventana encima, para quien puede
  // crear ubicaciones. No dentro de otra ventana (un solo nivel).
  canCreateLocations?: boolean;
  // Dentro de una ventana: paneles internos, sin la casilla de activo (lo
  // creado así nace activo) ni la nota de existencias.
  embedded?: boolean;
};

function areValuesEqual(
  left: ProductFormValues,
  right: ProductFormValues,
): boolean {
  return (
    left.standardCode === right.standardCode &&
    left.ownCode === right.ownCode &&
    left.name === right.name &&
    left.description === right.description &&
    left.storageLocationId ===
      right.storageLocationId &&
    left.minimumStock === right.minimumStock &&
    left.unitOfMeasure === right.unitOfMeasure &&
    left.customSalePrice === right.customSalePrice &&
    left.variantKind === right.variantKind &&
    left.isActive === right.isActive
  );
}

function mergeErrors(
  localErrors: ProductFormErrors,
  serverErrors: ProductFormErrors,
): ProductFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

export function ProductForm({
  mode,
  productId,
  token,
  canReadCosts = false,
  initialValues,
  locations,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
  canCreateLocations = false,
  embedded = false,
}: ProductFormProps) {
  const formRef =
    useRef<HTMLFormElement>(null);

  const [values, setValues] =
    useState<ProductFormValues>(
      initialValues,
    );

  const [localErrors, setLocalErrors] =
    useState<ProductFormErrors>({});

  const [priceReference, setPriceReference] =
    useState<ProductCostHistory | null>(null);

  // Ubicaciones creadas desde la ventana: se suman a las que trae la
  // página, que no se vuelve a consultar.
  const [createdLocations, setCreatedLocations] =
    useState<StorageLocationSummary[]>([]);

  const [isLocationDialogOpen, setIsLocationDialogOpen] =
    useState(false);

  const locationOptions = [
    ...locations,
    ...createdLocations.filter(
      (created) =>
        !locations.some((location) => location.id === created.id),
    ),
  ];

  const canOpenLocationDialog = canCreateLocations && !embedded;

  const isDirty = useMemo(
    () => !areValuesEqual(values, initialValues),
    [initialValues, values],
  );

  const errors = mergeErrors(
    localErrors,
    serverErrors,
  );

  useEffect(() => {
    if (mode !== "edit" || !productId || !canReadCosts) {
      return;
    }

    const controller = new AbortController();

    getLatestProductCostHistory(
      token,
      productId,
      controller.signal,
    )
      .then((history) => {
        if (controller.signal.aborted) {
          return;
        }

        setPriceReference(history);
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }

        setPriceReference(null);
      });

    return () => {
      controller.abort();
    };
  }, [canReadCosts, mode, productId, token]);

  useEffect(() => {
    function handleBeforeUnload(
      event: BeforeUnloadEvent,
    ): void {
      if (!isDirty || isSubmitting) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    globalThis.addEventListener(
      "beforeunload",
      handleBeforeUnload,
    );

    return () => {
      globalThis.removeEventListener(
        "beforeunload",
        handleBeforeUnload,
      );
    };
  }, [
    isDirty,
    isSubmitting,
  ]);

  useEffect(() => {
    function handleSaveShortcut(
      event: KeyboardEvent,
    ): void {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault();

        if (!isSubmitting && isFormShortcutTarget(formRef.current)) {
          formRef.current?.requestSubmit();
        }
      }
    }

    globalThis.addEventListener(
      "keydown",
      handleSaveShortcut,
    );

    return () => {
      globalThis.removeEventListener(
        "keydown",
        handleSaveShortcut,
      );
    };
  }, [isSubmitting]);

  function updateValue(
    field: ProductFormField,
    value: string | boolean,
  ): void {
    setValues((current) => ({
      ...current,
      [field]: value,
    }));

    setLocalErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = {
        ...current,
      };

      delete nextErrors[field];

      return nextErrors;
    });
  }

  function handleTextChange(
    field: Exclude<
      ProductFormField,
      "isActive"
    >,
  ) {
    return (
      event: ChangeEvent<
        HTMLInputElement |
        HTMLTextAreaElement |
        HTMLSelectElement
      >,
    ): void => {
      updateValue(
        field,
        event.target.value,
      );
    };
  }

  function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): void {
    event.preventDefault();

    const validationErrors =
      validateProductForm(values);

    setLocalErrors(validationErrors);

    if (
      Object.keys(validationErrors).length > 0
    ) {
      const firstInvalidField =
        formRef.current?.querySelector<
          HTMLInputElement |
          HTMLTextAreaElement |
          HTMLSelectElement
        >("[aria-invalid='true']");

      firstInvalidField?.focus();
      return;
    }

    void onSubmit(values);
  }

  function handleCancel(): void {
    if (
      isDirty &&
      !confirmWithFocusRestore(
        "Hay cambios sin guardar. ¿Desea salir y descartarlos?",
      )
    ) {
      return;
    }

    onCancel();
  }

  const submitLabel =
    mode === "create"
      ? "Crear producto"
      : "Guardar cambios";

  const submittingLabel =
    mode === "create"
      ? "Creando producto…"
      : "Guardando cambios…";

  const priceReferenceHint = (() => {
    if (!canReadCosts) {
      return "Lo define quien puede ver costos. Si está vacío, se usa el precio sugerido de la última compra confirmada.";
    }

    if (mode !== "edit") {
      return undefined;
    }

    if (
      !priceReference ||
      !priceReference.suggested_price
    ) {
      return "Sin precio sugerido calculado todavía (se calcula al procesar los costos de una compra). Si lo deja vacío, no habrá precio de venta hasta que calcule uno o lo defina aquí.";
    }

    const suggestedCrc =
      priceReference.currency === "USD"
        ? Number(priceReference.suggested_price) *
          Number(priceReference.exchange_rate)
        : Number(priceReference.suggested_price);

    if (!Number.isFinite(suggestedCrc)) {
      return undefined;
    }

    return `Sugerido: ₡${formatMoney(suggestedCrc)} (último cálculo, compra del ${priceReference.calculated_at.slice(0, 10)}). Si lo deja vacío, este es el precio que se usa.`;
  })();

  return (
    <>
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="grid gap-6"
    >
      {submitError && (
        <FormError message={submitError} />
      )}

      <section className={formSectionClassName(embedded)}>
        <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            Información del producto
          </h2>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Registre la identificación y descripción de la pieza.
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
          <Field
            id="standard-code"
            label="Código estándar"
            required
            hint="Código principal utilizado para identificar la pieza."
            error={errors.standardCode}
          >
            <Input
              id="standard-code"
              name="standardCode"
              value={values.standardCode}
              onChange={handleTextChange(
                "standardCode",
              )}
              hasError={
                Boolean(errors.standardCode)
              }
              aria-describedby={[
                "standard-code-hint",
                errors.standardCode
                  ? "standard-code-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              maxLength={50}
              autoComplete="off"
              spellCheck={false}
              disabled={isSubmitting}
              autoFocus
            />
          </Field>

          <Field
            id="product-name"
            label="Nombre"
            required
            hint="Nombre corto y reconocible del producto."
            error={errors.name}
          >
            <Input
              id="product-name"
              name="name"
              value={values.name}
              onChange={handleTextChange(
                "name",
              )}
              hasError={Boolean(errors.name)}
              aria-describedby={[
                "product-name-hint",
                errors.name
                  ? "product-name-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              maxLength={150}
              autoComplete="off"
              disabled={isSubmitting}
            />
          </Field>

          <Field
            id="variant-kind"
            label="Tipo de variante"
            required
            hint="Si este producto comparte código estándar con otro (original/genérico), sirve para distinguirlos."
            error={errors.variantKind}
          >
            <Select
              id="variant-kind"
              name="variantKind"
              value={values.variantKind}
              onChange={handleTextChange(
                "variantKind",
              )}
              hasError={
                Boolean(errors.variantKind)
              }
              aria-describedby={[
                "variant-kind-hint",
                errors.variantKind
                  ? "variant-kind-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={isSubmitting}
            >
              {VARIANT_KIND_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            id="product-own-code"
            label="Código propio"
            hint="Opcional: un código adicional, por ejemplo el del fabricante de un genérico. No puede repetirse."
            error={errors.ownCode}
          >
            <Input
              id="product-own-code"
              name="ownCode"
              value={values.ownCode}
              onChange={handleTextChange(
                "ownCode",
              )}
              hasError={Boolean(errors.ownCode)}
              aria-describedby={[
                "product-own-code-hint",
                errors.ownCode
                  ? "product-own-code-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              maxLength={50}
              autoComplete="off"
              spellCheck={false}
              className="font-mono uppercase"
              disabled={isSubmitting}
            />
          </Field>

          <div className="lg:col-span-2">
            <Field
              id="product-description"
              label="Descripción"
              hint="Información adicional para distinguir la pieza."
              error={errors.description}
            >
              <Textarea
                id="product-description"
                name="description"
                value={values.description}
                onChange={handleTextChange(
                  "description",
                )}
                hasError={
                  Boolean(errors.description)
                }
                aria-describedby={[
                  "product-description-hint",
                  errors.description
                    ? "product-description-error"
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={isSubmitting}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className={formSectionClassName(embedded)}>
        <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            Inventario y ubicación
          </h2>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Defina dónde se almacena la pieza y cuándo debe considerarse bajo mínimo.
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-3">
          <Field
            id="storage-location"
            label="Ubicación"
            required
            hint="Solo se muestran ubicaciones activas."
            error={errors.storageLocationId}
          >
            <div className="flex gap-2">
            <Select
              id="storage-location"
              name="storageLocationId"
              value={
                values.storageLocationId
              }
              onChange={handleTextChange(
                "storageLocationId",
              )}
              hasError={
                    Boolean(errors.storageLocationId)
                }
              aria-describedby={[
                "storage-location-hint",
                errors.storageLocationId
                  ? "storage-location-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={isSubmitting}
            >
              <option value="">
                Seleccione una ubicación
              </option>

              {locationOptions.map((location) => (
                <option
                  key={location.id}
                  value={location.id}
                >
                  {location.code}
                  {location.description
                    ? ` — ${location.description}`
                    : ""}
                </option>
              ))}
            </Select>

            {canOpenLocationDialog && (
              <Button
                type="button"
                variant="secondary"
                className="h-12 shrink-0"
                onClick={() => {
                  setIsLocationDialogOpen(true);
                }}
                disabled={isSubmitting}
              >
                Nueva
              </Button>
            )}
            </div>
          </Field>

          <Field
            id="minimum-stock"
            label="Stock mínimo"
            required
            hint="Cantidad mínima antes de generar una advertencia."
            error={errors.minimumStock}
          >
            <Input
              id="minimum-stock"
              name="minimumStock"
              type="number"
              value={values.minimumStock}
              onChange={handleTextChange(
                "minimumStock",
              )}
              hasError={
                Boolean(errors.minimumStock)
              }
              aria-describedby={[
                "minimum-stock-hint",
                errors.minimumStock
                  ? "minimum-stock-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              min={0}
              step={1}
              inputMode="numeric"
              disabled={isSubmitting}
            />
          </Field>

          <Field
            id="unit-of-measure"
            label="Unidad de medida"
            required
            hint="Ejemplos: unidad, kit, juego."
            error={errors.unitOfMeasure}
          >
            <Input
              id="unit-of-measure"
              name="unitOfMeasure"
              value={values.unitOfMeasure}
              onChange={handleTextChange(
                "unitOfMeasure",
              )}
              hasError={
                Boolean(errors.unitOfMeasure)
              }
              aria-describedby={[
                "unit-of-measure-hint",
                errors.unitOfMeasure
                  ? "unit-of-measure-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              maxLength={20}
              autoComplete="off"
              disabled={isSubmitting}
            />
          </Field>
        </div>

        {!embedded && (
        <div className="border-t border-[var(--color-border-soft)] p-5 sm:p-6">
          <label
            htmlFor="product-active"
            className="flex cursor-pointer items-start gap-3"
          >
            <input
              id="product-active"
              name="isActive"
              type="checkbox"
              checked={values.isActive}
              onChange={(event) => {
                updateValue(
                  "isActive",
                  event.target.checked,
                );
              }}
              disabled={isSubmitting}
              className="mt-0.5 size-5 rounded border-border accent-[var(--color-primary)]"
            />

            <span>
              <span className="block text-sm font-semibold text-foreground">
                Producto activo
              </span>

              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Los productos inactivos se conservan para mantener la trazabilidad, pero pueden ocultarse de la operación habitual.
              </span>
            </span>
          </label>
        </div>
        )}
      </section>

      <section className={formSectionClassName(embedded)}>
        <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            Precio de venta
          </h2>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {canReadCosts
              ? "Precio que se usa en la lista de productos y en la proforma. Totalmente editable: si lo deja vacío, se usa el último precio sugerido calculado a partir de una compra."
              : "Precio que se usa en la lista de productos y en la proforma."}
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
          <Field
            id="custom-sale-price"
            label="Precio de venta"
            hint={priceReferenceHint}
            error={errors.customSalePrice}
          >
            <Input
              id="custom-sale-price"
              name="customSalePrice"
              value={values.customSalePrice}
              onChange={handleTextChange(
                "customSalePrice",
              )}
              hasError={
                Boolean(errors.customSalePrice)
              }
              aria-describedby={[
                "custom-sale-price-hint",
                errors.customSalePrice
                  ? "custom-sale-price-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              inputMode="decimal"
              autoComplete="off"
              placeholder="Vacío = usar el precio sugerido"
              disabled={isSubmitting || !canReadCosts}
            />
          </Field>
        </div>
      </section>

      {!embedded && (
      <section className="rounded-[var(--radius-xl)] bg-[var(--color-primary-soft)] p-5 ring-1 ring-[rgb(7_81_132_/_12%)] sm:p-6">
        <h2 className="text-sm font-semibold text-foreground">
          Existencias protegidas
        </h2>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          La existencia actual no se modifica desde este formulario. Todo cambio de stock debe registrarse mediante entradas, salidas, ajustes o conteos físicos.
        </p>
      </section>
      )}

      <div className={formActionsClassName(embedded)}>
        {!embedded && (
        <div className="text-xs text-muted-foreground">
          {isDirty
            ? "Hay cambios pendientes de guardar."
            : "No hay cambios pendientes."}
        </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>

          <Button
            type="submit"
            isLoading={isSubmitting}
            loadingText={submittingLabel}
          >
            <span>{submitLabel}</span>

            {!isSubmitting && (
              <KeyboardShortcut
                keys={["Ctrl", "S"]}
              />
            )}
          </Button>
        </div>
      </div>
    </form>

    {canOpenLocationDialog && (
      <CreateLocationDialog
        open={isLocationDialogOpen}
        token={token}
        onClose={() => {
          setIsLocationDialogOpen(false);
        }}
        onCreated={(location) => {
          setCreatedLocations((current) => [...current, location]);
          updateValue("storageLocationId", String(location.id));
          setIsLocationDialogOpen(false);
        }}
      />
    )}
    </>
  );
}
