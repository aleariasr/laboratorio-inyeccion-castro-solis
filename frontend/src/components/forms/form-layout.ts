/**
 * Tarjetas de un formulario según dónde está (punto 7 del plan del
 * 2026-10-22). En una página, cada sección es una tarjeta (24 px, con
 * sombra) y la barra de acciones otra. Dentro de una ventana (Dialog),
 * que ya es la tarjeta, las secciones son paneles internos (18 px, sin
 * sombra) y las acciones van sueltas al final: la regla de anidado de
 * docs/frontend-design-system.md.
 */

export function formSectionClassName(embedded: boolean): string {
  return embedded
    ? "overflow-hidden rounded-[var(--radius-lg)] bg-surface ring-1 ring-[var(--color-border-soft)]"
    : "overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]";
}

export function formActionsClassName(embedded: boolean): string {
  return embedded
    ? "flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end"
    : "flex flex-col-reverse gap-3 rounded-[var(--radius-xl)] bg-surface p-4 shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)] sm:flex-row sm:items-center sm:justify-between";
}
