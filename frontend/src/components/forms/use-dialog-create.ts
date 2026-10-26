"use client";

import { useState } from "react";

import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";
import type { ApiFieldErrors } from "@/lib/api/types";

type DialogCreateState<TErrors> = {
  isSubmitting: boolean;
  submitError: string | null;
  serverErrors: TErrors;
};

/**
 * Estado de "crear desde una ventana" (punto 7 del plan del 2026-10-22):
 * guardar, mostrar el error del servidor en su campo y devolver lo creado
 * para que quede elegido en el formulario de fondo. Lo usan los
 * Create…Dialog de cada módulo.
 */
export function useDialogCreate<TValues, TErrors extends object, TResult>({
  create,
  mapFieldErrors,
  fallbackMessage,
  onCreated,
}: {
  create: (values: TValues) => Promise<TResult>;
  mapFieldErrors: (fieldErrors: ApiFieldErrors) => TErrors;
  fallbackMessage: string;
  onCreated: (result: TResult) => void;
}) {
  const [state, setState] = useState<DialogCreateState<TErrors>>({
    isSubmitting: false,
    submitError: null,
    serverErrors: {} as TErrors,
  });

  async function submit(values: TValues): Promise<void> {
    setState({ isSubmitting: true, submitError: null, serverErrors: {} as TErrors });

    try {
      const result = await create(values);

      setState({ isSubmitting: false, submitError: null, serverErrors: {} as TErrors });
      onCreated(result);
    } catch (error: unknown) {
      let message = fallbackMessage;
      let serverErrors = {} as TErrors;

      if (error instanceof ApiTimeoutError) {
        message = "La operación tardó demasiado tiempo en responder.";
      } else if (error instanceof ApiNetworkError) {
        message = "No fue posible comunicarse con el sistema local.";
      } else if (error instanceof ApiError) {
        message =
          error.status === 401
            ? "La sesión expiró. Vuelva a iniciar sesión."
            : error.status === 403
              ? "Este usuario no tiene permiso para crear esto."
              : error.message;

        if (error.status === 400) {
          serverErrors = mapFieldErrors(error.fieldErrors);
        }
      }

      setState({ isSubmitting: false, submitError: message, serverErrors });
    }
  }

  function reset(): void {
    setState({ isSubmitting: false, submitError: null, serverErrors: {} as TErrors });
  }

  return { ...state, submit, reset };
}
