"use client";

import { useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { ProductLabelItem } from "./api";
import { sortProducts } from "./ordering";
import { ProductOrderingSelect } from "./product-ordering-select";
import type { Product, ProductOrdering } from "./types";

/** Igual que MAX_LABELS_PER_DOCUMENT del backend (product_labels.py). */
const MAX_LABELS_PER_DOCUMENT = 200;

/** Hoja A4 de 3 × 7 (LABELS_PER_PAGE del backend). */
const LABELS_PER_PAGE = 21;

const HEADER_CLASSES =
  "px-4 py-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground";

function parseCopies(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) {
    return null;
  }

  const copies = Number(value);

  return copies >= 1 && copies <= MAX_LABELS_PER_DOCUMENT ? copies : null;
}

type ProductLabelsFormProps = {
  products: Product[];
  initialOrdering: ProductOrdering;
  isGenerating: boolean;
  submitError: string | null;
  onSubmit: (items: ProductLabelItem[]) => void | Promise<void>;
  onCancel: () => void;
};

/**
 * Puntos 2 y 4 del plan del 2026-10-22: antes de imprimir se elige el orden
 * de las etiquetas (propuesto: el de la lista) y cuántas copias lleva cada
 * producto (1 por defecto). Va dentro de la ventana de "Generar etiquetas":
 * se monta al abrirla, así cada vez arranca con la selección y el orden
 * actuales.
 */
export function ProductLabelsForm({
  products,
  initialOrdering,
  isGenerating,
  submitError,
  onSubmit,
  onCancel,
}: ProductLabelsFormProps) {
  const [ordering, setOrdering] = useState<ProductOrdering>(initialOrdering);

  const [copiesById, setCopiesById] = useState<Record<number, string>>({});

  const [bulkCopies, setBulkCopies] = useState("1");

  const sortedProducts = sortProducts(products, ordering);

  const copiesFor = (productId: number): string => copiesById[productId] ?? "1";

  const parsedCopies = sortedProducts.map((product) => parseCopies(copiesFor(product.id)));

  const hasInvalidCopies = parsedCopies.some((copies) => copies === null);

  const totalLabels = parsedCopies.reduce<number>((total, copies) => total + (copies ?? 0), 0);

  const totalPages = Math.ceil(totalLabels / LABELS_PER_PAGE);

  const isOverLimit = totalLabels > MAX_LABELS_PER_DOCUMENT;

  const bulkCopiesValue = parseCopies(bulkCopies);

  function applyBulkCopies(): void {
    if (bulkCopiesValue === null) {
      return;
    }

    setCopiesById(
      Object.fromEntries(products.map((product) => [product.id, String(bulkCopiesValue)])),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (hasInvalidCopies || isOverLimit || isGenerating) {
      return;
    }

    void onSubmit(
      sortedProducts.map((product, index) => ({
        productId: product.id,
        copies: parsedCopies[index] ?? 1,
      })),
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      {submitError && <FormError message={submitError} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="product-labels-ordering"
            className="mb-2 block text-sm font-semibold text-foreground"
          >
            Orden de las etiquetas
          </label>

          <ProductOrderingSelect
            id="product-labels-ordering"
            value={ordering}
            onChange={setOrdering}
            disabled={isGenerating}
          />
        </div>

        <div>
          <label
            htmlFor="product-labels-bulk-copies"
            className="mb-2 block text-sm font-semibold text-foreground"
          >
            Misma cantidad para todos
          </label>

          <div className="flex gap-2">
            <div className="w-24 shrink-0">
              <Input
                id="product-labels-bulk-copies"
                value={bulkCopies}
                onChange={(event) => {
                  setBulkCopies(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyBulkCopies();
                  }
                }}
                hasError={bulkCopiesValue === null}
                inputMode="numeric"
                autoComplete="off"
                aria-label="Copias para todos los productos"
                className="h-11 text-right"
                disabled={isGenerating}
              />
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={applyBulkCopies}
              disabled={bulkCopiesValue === null || isGenerating}
            >
              Aplicar
            </Button>
          </div>
        </div>
      </div>

      <div className="max-h-[45vh] overflow-auto rounded-[var(--radius-lg)] ring-1 ring-[var(--color-border-soft)]">
        <table className="w-full min-w-[560px] border-collapse">
          <thead className="sticky top-0 bg-surface-muted">
            <tr className="border-b border-[var(--color-border-soft)] text-left">
              <th className={`${HEADER_CLASSES} w-12 text-right`}>#</th>
              <th className={HEADER_CLASSES}>Código</th>
              <th className={HEADER_CLASSES}>Producto</th>
              <th className={HEADER_CLASSES}>Ubicación</th>
              <th className={`${HEADER_CLASSES} text-right`}>Copias</th>
            </tr>
          </thead>

          <tbody>
            {sortedProducts.map((product, index) => (
              <tr
                key={product.id}
                className="border-b border-[var(--color-border-soft)] bg-surface last:border-b-0"
              >
                <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                  {index + 1}
                </td>

                <td className="whitespace-nowrap px-4 py-2.5">
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {product.standard_code}
                  </span>

                  {product.own_code && (
                    <p className="font-mono text-xs text-muted-foreground">
                      Propio: {product.own_code}
                    </p>
                  )}
                </td>

                <td className="px-4 py-2.5 text-sm text-foreground">{product.name}</td>

                <td className="px-4 py-2.5 font-mono text-sm text-muted-foreground">
                  {product.storage_location_detail.code}
                </td>

                <td className="px-4 py-2">
                  <Input
                    value={copiesFor(product.id)}
                    onChange={(event) => {
                      const value = event.target.value;

                      setCopiesById((current) => ({ ...current, [product.id]: value }));
                    }}
                    hasError={parsedCopies[index] === null}
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={`Copias de ${product.standard_code}, ${product.name}`}
                    className="ml-auto h-10 w-20 text-right"
                    disabled={isGenerating}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="font-semibold text-foreground">
          {totalLabels} {totalLabels === 1 ? "etiqueta" : "etiquetas"}
          <span className="font-normal text-muted-foreground">
            {" "}
            · {totalPages} {totalPages === 1 ? "hoja" : "hojas"} de {LABELS_PER_PAGE}
          </span>
        </p>

        {hasInvalidCopies ? (
          <p className="font-medium text-danger" role="alert">
            Las copias de cada producto van de 1 a {MAX_LABELS_PER_DOCUMENT}.
          </p>
        ) : isOverLimit ? (
          <p className="font-medium text-danger" role="alert">
            Un documento lleva hasta {MAX_LABELS_PER_DOCUMENT} etiquetas.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-[var(--color-border-soft)] pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isGenerating}>
          Cancelar
        </Button>

        <Button
          type="submit"
          isLoading={isGenerating}
          loadingText="Generando PDF…"
          disabled={hasInvalidCopies || isOverLimit}
        >
          Generar PDF
        </Button>
      </div>
    </form>
  );
}
