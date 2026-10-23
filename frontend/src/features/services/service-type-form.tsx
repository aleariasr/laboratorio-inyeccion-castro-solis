"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Product } from "@/features/inventory/products/types";
import { searchActiveProducts } from "@/features/inventory/suppliers/api";

import type {
  ServiceTypeFormErrors,
  ServiceTypeFormField,
  ServiceTypeFormValues,
} from "./types";
import { validateServiceTypeForm } from "./validation";

type ServiceTypeFormProps = {
  mode: "create" | "edit";
  token: string;
  initialValues: ServiceTypeFormValues;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: ServiceTypeFormErrors;
  onSubmit: (values: ServiceTypeFormValues) => void | Promise<void>;
  onCancel: () => void;
  // Dentro de una ventana (Dialog): secciones como paneles internos.
  embedded?: boolean;
};

// En una página, cada sección es una tarjeta (24 px, con sombra). Dentro
// de una ventana (embedded), que ya es la tarjeta, las secciones son
// paneles internos: 18 px y sin sombra, como el resto de la escala.
const SECTION_CLASSES =
  "overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]";

const EMBEDDED_SECTION_CLASSES =
  "overflow-hidden rounded-[var(--radius-lg)] bg-surface ring-1 ring-[var(--color-border-soft)]";

/**
 * Tipo de servicio completo (punto 1A del plan del 2026-10-22): nombre,
 * precio de mano de obra, qué incluye y el kit de accesorios que se
 * propone al usarlo. El kit es una propuesta: no descuenta inventario
 * hasta que se confirma en un servicio.
 */
export function ServiceTypeForm({
  mode,
  token,
  initialValues,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
  embedded = false,
}: ServiceTypeFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const sectionClasses = embedded ? EMBEDDED_SECTION_CLASSES : SECTION_CLASSES;

  const [values, setValues] = useState<ServiceTypeFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<ServiceTypeFormErrors>({});

  const [query, setQuery] = useState("");

  const [results, setResults] = useState<Product[]>([]);

  const [isListOpen, setIsListOpen] = useState(false);

  const [searchError, setSearchError] = useState<string | null>(null);

  const errors = { ...serverErrors, ...localErrors };

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();

    const timeoutId = globalThis.setTimeout(() => {
      searchActiveProducts(token, trimmedQuery, controller.signal)
        .then((products) => {
          if (controller.signal.aborted) {
            return;
          }

          setResults(products);
          setSearchError(null);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }

          setSearchError("No fue posible buscar productos.");
        });
    }, 350);

    return () => {
      globalThis.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, token]);

  function clearError(field: ServiceTypeFormField): void {
    setLocalErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });
  }

  function updateValue<FieldName extends ServiceTypeFormField>(
    field: FieldName,
    value: ServiceTypeFormValues[FieldName],
  ): void {
    setValues((current) => ({ ...current, [field]: value }));
    clearError(field);
  }

  function addProduct(product: Product): void {
    setQuery("");
    setResults([]);
    setIsListOpen(false);
    clearError("kitItems");

    setValues((current) => {
      const existing = current.kitItems.find((item) => item.productId === product.id);

      // Elegir otra vez un producto que ya está suma una unidad, en vez de
      // repetirlo (el backend no admite el mismo producto dos veces).
      if (existing) {
        return {
          ...current,
          kitItems: current.kitItems.map((item) =>
            item.productId === product.id
              ? { ...item, quantity: String((Number(item.quantity) || 0) + 1) }
              : item,
          ),
        };
      }

      return {
        ...current,
        kitItems: [
          ...current.kitItems,
          {
            productId: product.id,
            standardCode: product.standard_code,
            ownCode: product.own_code,
            name: product.name,
            quantity: "1",
          },
        ],
      };
    });
  }

  function updateKitQuantity(productId: number, quantity: string): void {
    clearError("kitItems");
    setValues((current) => ({
      ...current,
      kitItems: current.kitItems.map((item) =>
        item.productId === productId ? { ...item, quantity } : item,
      ),
    }));
  }

  function removeKitItem(productId: number): void {
    clearError("kitItems");
    setValues((current) => ({
      ...current,
      kitItems: current.kitItems.filter((item) => item.productId !== productId),
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validateServiceTypeForm(values);

    setLocalErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      formRef.current
        ?.querySelector<HTMLElement>("[aria-invalid='true']")
        ?.focus();
      return;
    }

    void onSubmit(values);
  }

  const showResults = isListOpen && query.trim().length >= 2;

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="grid gap-6">
      {submitError && <FormError message={submitError} />}

      <section className={sectionClasses}>
        <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            Servicio
          </h2>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            El precio de mano de obra se propone al cobrar; en cada servicio se puede cambiar.
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
          <Field id="service-type-name" label="Nombre" required error={errors.name}>
            <Input
              id="service-type-name"
              value={values.name}
              onChange={(event) => {
                updateValue("name", event.target.value);
              }}
              hasError={Boolean(errors.name)}
              maxLength={150}
              autoComplete="off"
              disabled={isSubmitting}
              autoFocus
            />
          </Field>

          <Field
            id="service-type-labor-price"
            label="Precio de mano de obra"
            hint="Opcional. Sin precio, se escribe en cada servicio."
            error={errors.defaultLaborPrice}
          >
            <Input
              id="service-type-labor-price"
              value={values.defaultLaborPrice}
              onChange={(event) => {
                updateValue("defaultLaborPrice", event.target.value);
              }}
              hasError={Boolean(errors.defaultLaborPrice)}
              inputMode="decimal"
              autoComplete="off"
              placeholder="Sin precio definido"
              disabled={isSubmitting}
            />
          </Field>

          <div className="lg:col-span-2">
            <Field
              id="service-type-description"
              label="Qué incluye"
              hint="Descripción del servicio, por ejemplo los pasos o las pruebas que comprende."
              error={errors.description}
            >
              <Textarea
                id="service-type-description"
                value={values.description}
                onChange={(event) => {
                  updateValue("description", event.target.value);
                }}
                hasError={Boolean(errors.description)}
                disabled={isSubmitting}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className={sectionClasses}>
        <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            Accesorios que suele llevar
          </h2>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Se proponen al elegir este tipo en un servicio. No descuentan inventario hasta que se
            confirman en el servicio.
          </p>
        </div>

        <div className="grid gap-5 p-5 sm:p-6">
          <div className="relative max-w-xl">
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setIsListOpen(true);

                if (event.target.value.trim().length < 2) {
                  setResults([]);
                  setSearchError(null);
                }
              }}
              onFocus={() => {
                setIsListOpen(true);
              }}
              onBlur={() => {
                globalThis.setTimeout(() => {
                  setIsListOpen(false);
                }, 150);
              }}
              placeholder="Buscar producto por código o nombre"
              aria-label="Agregar producto al kit"
              autoComplete="off"
              spellCheck={false}
              disabled={isSubmitting}
            />

            {showResults && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-md)]">
                {searchError && (
                  <p className="px-4 py-3 text-sm text-[var(--color-danger)]">{searchError}</p>
                )}

                {!searchError && results.length === 0 && (
                  <p className="px-4 py-3 text-sm text-muted-foreground">Sin resultados.</p>
                )}

                {!searchError && results.length > 0 && (
                  <ul className="max-h-64 overflow-y-auto">
                    {results.map((product) => (
                      <li key={product.id}>
                        <button
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            addProduct(product);
                          }}
                          className="block w-full px-4 py-2.5 text-left text-sm hover:bg-surface-muted"
                        >
                          <span className="font-mono font-semibold text-foreground">
                            {product.standard_code}
                          </span>

                          {product.own_code && (
                            <span className="ml-2 font-mono text-xs text-muted-foreground">
                              {product.own_code}
                            </span>
                          )}

                          <span className="ml-2 text-muted-foreground">{product.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {errors.kitItems && (
            <p className="text-sm font-medium text-danger" role="alert">
              {errors.kitItems}
            </p>
          )}

          {values.kitItems.length === 0 ? (
            <p className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Sin accesorios. Busque un producto para agregarlo.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border-soft)] rounded-[var(--radius-lg)] ring-1 ring-[var(--color-border-soft)]">
              {values.kitItems.map((item) => (
                <li
                  key={item.productId}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-mono font-semibold text-foreground">
                        {item.standardCode}
                      </span>

                      {item.ownCode && (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {item.ownCode}
                        </span>
                      )}
                    </p>

                    <p className="truncate text-sm text-muted-foreground">{item.name}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      Cantidad
                      <Input
                        value={item.quantity}
                        onChange={(event) => {
                          updateKitQuantity(item.productId, event.target.value);
                        }}
                        inputMode="numeric"
                        autoComplete="off"
                        aria-label={`Cantidad de ${item.name}`}
                        className="h-10 w-20 text-center"
                        disabled={isSubmitting}
                      />
                    </label>

                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        removeKitItem(item.productId);
                      }}
                      disabled={isSubmitting}
                    >
                      Quitar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {mode === "edit" && (
        <section className={sectionClasses}>
          <div className="p-5 sm:p-6">
            <label htmlFor="service-type-active" className="flex cursor-pointer items-start gap-3">
              <input
                id="service-type-active"
                type="checkbox"
                checked={values.isActive}
                onChange={(event) => {
                  updateValue("isActive", event.target.checked);
                }}
                disabled={isSubmitting}
                className="mt-0.5 size-5 rounded border-border accent-[var(--color-primary)]"
              />

              <span>
                <span className="block text-sm font-semibold text-foreground">
                  Tipo de servicio activo
                </span>

                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  Los inactivos no aparecen para elegir en servicios nuevos; los servicios que ya
                  lo usan lo conservan.
                </span>
              </span>
            </label>
          </div>
        </section>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>

        <Button
          type="submit"
          isLoading={isSubmitting}
          loadingText={mode === "create" ? "Creando…" : "Guardando…"}
        >
          {mode === "create" ? "Crear tipo de servicio" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
