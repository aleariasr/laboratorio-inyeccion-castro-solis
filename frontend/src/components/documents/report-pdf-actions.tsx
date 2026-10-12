"use client";

import { useState } from "react";

import {
  ArrowLeftIcon,
  DownloadIcon,
  PrinterIcon,
  SpreadsheetIcon,
} from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type ReportPdfActionsProps = {
  /** Pide el PDF al backend con los filtros que tiene la pantalla. */
  fetchPdf: () => Promise<Blob>;
  fileName: string;
  /**
   * Si se pasa, agrega "Exportar a Excel" (punto 28), con los mismos
   * filtros que el PDF.
   */
  fetchExcel?: () => Promise<Blob>;
  excelFileName?: string;
  onUnauthorized: () => void;
  /** Si se pasa, agrega el botón "Volver" que ya tenían las pantallas. */
  onBack?: () => void;
  disabled?: boolean;
};

type PendingAction = "print" | "download" | "excel" | null;

function getFileErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return "Este usuario no tiene permisos para generar este archivo.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof ApiTimeoutError) {
    return "El archivo tardó demasiado en generarse.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  return "No fue posible generar el archivo.";
}

function saveBlob(blob: Blob, fileName: string): void {
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
}

/**
 * Botones "Imprimir" y "Descargar PDF" de los reportes (puntos 2 + 27),
 * y "Exportar a Excel" donde aplica (punto 28). "Imprimir" y "Descargar
 * PDF" usan el mismo PDF del servidor: el primero lo abre en una ventana
 * nueva, en el visor de PDF, que tiene su propio botón de imprimir; el
 * segundo lo guarda.
 */
export function ReportPdfActions({
  fetchPdf,
  fileName,
  fetchExcel,
  excelFileName,
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

    setErrorMessage(getFileErrorMessage(error));
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

  async function handleSave(
    action: "download" | "excel",
    fetchFile: () => Promise<Blob>,
    targetFileName: string,
  ): Promise<void> {
    setPendingAction(action);
    setErrorMessage(null);

    try {
      saveBlob(await fetchFile(), targetFileName);
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

        {fetchExcel && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void handleSave("excel", fetchExcel, excelFileName ?? "reporte.xlsx");
            }}
            isLoading={pendingAction === "excel"}
            loadingText="Generando…"
            disabled={disabled || isBusy}
          >
            <SpreadsheetIcon />
            Exportar a Excel
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
            void handleSave("download", fetchPdf, fileName);
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
