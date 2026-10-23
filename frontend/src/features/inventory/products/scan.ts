import type { Product } from "./types";

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Producto que corresponde a un código escrito o escaneado completo, para
 * seleccionarlo solo en compras y ventas. Devuelve null si no hay uno
 * solo sin dudas; entonces se elige de la lista.
 *
 * 1. El código propio es único: si coincide, es ese.
 * 2. Si coincide el universal y lo tiene un solo producto, es ese.
 * 3. Si lo comparte una familia (original y genérico), es el que no
 *    tiene código propio: los que lo tienen llevan el propio en el
 *    código de barras de su etiqueta (ver label_barcode_value en
 *    apps/inventory/services/product_labels.py), así que el universal
 *    escaneado no es de ellos. Si quedan varios sin código propio, no
 *    se adivina.
 */
export function findScannedProduct(
  products: Product[],
  query: string,
): Product | null {
  const code = normalizeCode(query);

  if (!code) {
    return null;
  }

  const byOwnCode = products.find(
    (product) => product.own_code && normalizeCode(product.own_code) === code,
  );

  if (byOwnCode) {
    return byOwnCode;
  }

  const byStandardCode = products.filter(
    (product) => normalizeCode(product.standard_code) === code,
  );

  if (byStandardCode.length === 1) {
    return byStandardCode[0];
  }

  const withoutOwnCode = byStandardCode.filter((product) => !product.own_code);

  return withoutOwnCode.length === 1 ? withoutOwnCode[0] : null;
}
