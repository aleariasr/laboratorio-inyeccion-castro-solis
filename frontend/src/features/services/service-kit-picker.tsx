"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { getServiceTypes } from "./api";
import { ServiceKitPanel } from "./service-kit-panel";
import type { ServiceTypeDetail } from "./types";

type ServiceKitPickerProps = {
  token: string;
  serviceRecordId: number;
  onApplied: () => Promise<void>;
  onClose: () => void;
  onUnauthorized: () => void;
};

const SELECT_CLASSES =
  "h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)]";

/**
 * "Agregar kit" en Accesorios utilizados: se elige un tipo de servicio y
 * se proponen los accesorios que suele llevar (ServiceKitPanel). Lo usan
 * el operario y el Administrador; no muestra precios.
 */
export function ServiceKitPicker({
  token,
  serviceRecordId,
  onApplied,
  onClose,
  onUnauthorized,
}: ServiceKitPickerProps) {
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeDetail[] | null>(null);

  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    getServiceTypes(token, "", controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setServiceTypes(result.filter((serviceType) => serviceType.kit_items.length > 0));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setServiceTypes([]);
        }
      });

    return () => {
      controller.abort();
    };
  }, [token]);

  const selected = serviceTypes?.find((serviceType) => String(serviceType.id) === selectedId);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label
            htmlFor="service-kit-type"
            className="mb-1.5 block text-sm font-semibold text-foreground"
          >
            Tipo de servicio
          </label>

          <select
            id="service-kit-type"
            value={selectedId}
            onChange={(event) => {
              setSelectedId(event.target.value);
            }}
            disabled={serviceTypes === null || serviceTypes.length === 0}
            className={SELECT_CLASSES}
          >
            <option value="">
              {serviceTypes === null
                ? "Cargando tipos…"
                : serviceTypes.length === 0
                  ? "Ningún tipo tiene accesorios definidos"
                  : "Elija un tipo"}
            </option>
            {serviceTypes?.map((serviceType) => (
              <option key={serviceType.id} value={serviceType.id}>
                {serviceType.name}
              </option>
            ))}
          </select>
        </div>

        <Button type="button" variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      </div>

      {selected && (
        <ServiceKitPanel
          key={selected.id}
          token={token}
          serviceRecordId={serviceRecordId}
          serviceType={selected}
          onApplied={async () => {
            await onApplied();
            onClose();
          }}
          onDismiss={() => {
            setSelectedId("");
          }}
          onUnauthorized={onUnauthorized}
        />
      )}
    </div>
  );
}
