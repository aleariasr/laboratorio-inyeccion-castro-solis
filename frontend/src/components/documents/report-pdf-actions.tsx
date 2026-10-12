"use client";

import { useState } from "react";

import {
  ArrowLeftIcon,
  DownloadIcon,
  PrinterIcon,
} from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type ReportPdfActionsProps = {
  /** Pide el PDF al backend con los filtros que tiene la pantalla. */
  fetchPdf: () => Promise<Blob>;
  fileName: string;
  onUnauthorized: () => void;
  /** Si se pasa, agrega el botón "Volver" que ya tenían las pantallas. */
  onBack?: () => void;
  disabled?: boolean;
};

type PendingAction = "print" | "download" | null;

function getPdfErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return "Este usuario no tiene permisos para generar este PDF.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof ApiTimeoutError) {
    return "El PDF tardó demasiado en generarse.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  return "No fue posible generar el PDF.";
}

/**
 * Botones "Imprimir" y "Descargar PDF" de los reportes (puntos 2 + 27).
 * Los dos usan el mismo PDF del servidor: "Imprimir" lo abre en una
 * ventana nueva, en el visor de PDF, que tiene su propio botón de
 * imprimir; "Descargar PDF" lo guarda.
 */
export function ReportPdfActions({
  fetchPdf,
  fileName,
  onUnauthorized,
  onBack,
  disabled = false,
}: ReportPdfActionsProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleError(error: unknown): void {
    if (error instanceof ApiError && error.status === 401) {
      onUnauthorized();
      return;
    }

    setErrorMessage(getPdfErrorMessage(error));
  }

  async function handlePrint(): Promise<void> {
    // La ventana se abre en el clic: si se abriera después de esperar
    // el PDF, el navegador la trataría como emergente y la bloquearía.
    const printWindow = window.open("", "_blank");

    if (printWindow) {
      printWindow.document.title = "Preparando PDF…";
      printWindow.document.body.style.fontFamily = "system-ui, sans-serif";
      printWindow.document.body.style.color = "#5b6b76";
      printWindow.document.body.textContent = "Preparando el PDF…";
    }

    setPendingAction("print");
    setErrorMessage(null);

    try {
      const blob = await fetchPdf();
      const pdfUrl = URL.createObjectURL(blob);

      if (printWindow && !printWindow.closed) {
        printWindow.location.href = pdfUrl;
      } else {
        window.open(pdfUrl, "_blank");
      }

      // El visor ya cargó el PDF mucho antes de esto.
      globalThis.setTimeout(() => {
        URL.revokeObjectURL(pdfUrl);
      }, 60_000);
    } catch (error: unknown) {
      printWindow?.close();
      handleError(error);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDownload(): Promise<void> {
    setPendingAction("download");
    setErrorMessage(null);

    try {
      const blob = await fetchPdf();
      const downloadUrl = URL.createObjectURL(blob);

      const anchor = document.createElement("a");

      anchor.href = downloadUrl;
      anchor.download = fileName;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      globalThis.setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
      }, 1_000);
    } catch (error: unknown) {
      handleError(error);
    } finally {
      setPendingAction(null);
    }
  }

  const isBusy = pendingAction !== null;

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {onBack && (
          <Button type="button" variant="secondary" onClick={onBack}>
            <ArrowLeftIcon />
            Volver
          </Button>
        )}

        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void handlePrint();
          }}
          isLoading={pendingAction === "print"}
          loadingText="Preparando…"
          disabled={disabled || isBusy}
        >
          <PrinterIcon />
          Imprimir
        </Button>

        <Button
          type="button"
          onClick={() => {
            void handleDownload();
          }}
          isLoading={pendingAction === "download"}
          loadingText="Generando…"
          disabled={disabled || isBusy}
        >
          <DownloadIcon />
          Descargar PDF
        </Button>
      </div>

      {errorMessage && (
        <p
          role="alert"
          className="max-w-sm text-sm text-[var(--color-danger)] sm:text-right"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
