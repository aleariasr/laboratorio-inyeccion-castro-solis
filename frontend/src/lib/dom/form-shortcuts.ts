/**
 * Si el atajo de guardar (Ctrl+S) le toca a este formulario.
 *
 * Cada formulario escucha Ctrl+S en toda la ventana. Con una ventana
 * encima abierta (Dialog, punto 7 del plan del 2026-10-22), el de fondo
 * también lo recibiría y se guardarían los dos: solo responde el que está
 * dentro de la ventana abierta.
 */
export function isFormShortcutTarget(form: HTMLFormElement | null): boolean {
  if (!form) {
    return false;
  }

  const openDialog = document.querySelector("dialog[open]");

  return openDialog === null || openDialog.contains(form);
}
