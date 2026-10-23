import type { useRouter } from "next/navigation";

type AppRouter = ReturnType<typeof useRouter>;

/**
 * Cancelar en una pantalla de creación: vuelve a donde estaba la persona
 * (la lista, el tablero…) sin dejar la pantalla de creación en el
 * historial. Si no hay a dónde volver (se abrió la dirección directo),
 * va a `fallback`.
 *
 * No usar push(lista): deja "lista → crear → lista" en el historial, y el
 * siguiente "atrás" vuelve a abrir el formulario.
 *
 * La edición sigue otra regla: es un modo del detalle, no un paso más.
 * Se entra con replace(".../edit") y se sale (al guardar o cancelar) con
 * replace(detalle), así el historial queda "lista → detalle" y "Volver"
 * en el detalle lleva a la lista, no de nuevo a la edición.
 */
export function goBackOr(router: AppRouter, fallback: string): void {
  if (globalThis.history.length > 1) {
    router.back();
    return;
  }

  router.replace(fallback);
}
