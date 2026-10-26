"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { CloseIcon } from "@/components/icons/app-icons";

type DialogProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Ventana encima del formulario actual (punto 7 del plan del 2026-10-22):
 * para crear lo que falta sin salir de donde se está. Usa el <dialog>
 * nativo: el foco queda dentro, Esc la cierra y el fondo se oscurece. Al
 * cerrarse, el foco vuelve al botón que la abrió.
 *
 * Un solo nivel: dentro de una ventana no se abre otra.
 */
export function Dialog({ open, title, description, onClose, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const returnFocusRef = useRef<HTMLElement | null>(null);

  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();

      // showModal le da el foco al primer elemento enfocable (la ×), y el
      // autoFocus de React ya corrió antes de abrirse: se pasa al primer
      // campo del formulario.
      dialog
        .querySelector<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled])")
        ?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      returnFocusRef.current?.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc: lo cierra quien controla `open`, para que el estado no se
        // desincronice.
        event.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[calc(100vh-48px)] w-[min(760px,calc(100vw-32px))] overflow-y-auto rounded-[var(--radius-xl)] bg-background p-0 text-foreground shadow-[var(--shadow-lg)] ring-1 ring-[var(--color-border-soft)] backdrop:bg-[rgb(15_23_42_/_45%)]"
    >
      {open && (
        <div className="grid gap-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold tracking-[-0.02em]">
                {title}
              </h2>

              {description && (
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-[var(--radius-md)] p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
            >
              <CloseIcon />
            </button>
          </div>

          {children}
        </div>
      )}
    </dialog>
  );
}
