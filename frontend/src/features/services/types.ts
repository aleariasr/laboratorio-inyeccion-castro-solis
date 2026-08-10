import type { CustomerSummary } from "../sales/types";

export type ServiceStatus =
  | "RECEIVED"
  | "IN_PROGRESS"
  | "READY"
  | "DELIVERED"
  | "CANCELLED";

export type InjectorSummary = {
  id: number;
  customer: number;
  customer_detail: CustomerSummary;
  injector_number: string;
  description: string;
  is_active: boolean;
};

export type ServiceRecord = {
  id: number;
  injector: number;
  injector_detail: InjectorSummary;
  received_at: string;
  delivered_at: string | null;
  resistance: string | null;
  leakage: string | null;
  notes_before: string;
  notes_after: string;
  observations: string;
  status: ServiceStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ServiceRecordFilters = {
  query: string;
  injectorId?: number;
  customerId?: number;
  status: "" | ServiceStatus;
  activeState: "all" | "active" | "inactive";
  receivedFrom: string;
  receivedTo: string;
  page: number;
  pageSize: number;
};

// Creación ("recepción" de un inyector)
export type ServiceRecordCreatePayload = {
  injector: number;
  received_at: string;
};

export type ServiceRecordCreateFormValues = {
  injectorId: string;
  receivedAt: string;
};

export type ServiceRecordCreateFormField = "injectorId" | "receivedAt";

export type ServiceRecordCreateFormErrors = Partial<Record<ServiceRecordCreateFormField, string>>;

export const EMPTY_SERVICE_RECORD_CREATE_FORM_VALUES: ServiceRecordCreateFormValues = {
  injectorId: "",
  receivedAt: "",
};

export function buildServiceRecordCreatePayload(
  values: ServiceRecordCreateFormValues,
): ServiceRecordCreatePayload {
  return {
    injector: Number(values.injectorId),
    received_at: new Date(values.receivedAt).toISOString(),
  };
}

// Datos técnicos (editables mientras el servicio no esté entregado o anulado)
export type ServiceRecordTechnicalWritePayload = {
  resistance: string;
  leakage: string;
  notes_before: string;
  notes_after: string;
  observations: string;
};

export type ServiceRecordTechnicalFormValues = {
  resistance: string;
  leakage: string;
  notesBefore: string;
  notesAfter: string;
  observations: string;
};

export type ServiceRecordTechnicalFormField =
  | "resistance"
  | "leakage"
  | "notesBefore"
  | "notesAfter"
  | "observations";

export type ServiceRecordTechnicalFormErrors = Partial<Record<ServiceRecordTechnicalFormField, string>>;

export function serviceRecordToTechnicalFormValues(
  serviceRecord: ServiceRecord,
): ServiceRecordTechnicalFormValues {
  return {
    resistance: serviceRecord.resistance ?? "",
    leakage: serviceRecord.leakage ?? "",
    notesBefore: serviceRecord.notes_before,
    notesAfter: serviceRecord.notes_after,
    observations: serviceRecord.observations,
  };
}

export function buildServiceRecordTechnicalWritePayload(
  values: ServiceRecordTechnicalFormValues,
): ServiceRecordTechnicalWritePayload {
  return {
    resistance: values.resistance.trim(),
    leakage: values.leakage.trim(),
    notes_before: values.notesBefore.trim(),
    notes_after: values.notesAfter.trim(),
    observations: values.observations.trim(),
  };
}

// Accesorios: catálogo global (InjectorAccessory)
export type Accessory = {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
};

export type AccessoryWritePayload = {
  name: string;
  description: string;
};

// Línea de accesorio utilizado en un servicio (InjectorServiceAccessory)
export type ServiceAccessory = {
  id: number;
  service_record: number;
  accessory: number;
  accessory_detail: Accessory;
  quantity: number;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type ServiceAccessoryWritePayload = {
  service_record: number;
  accessory: number;
  quantity: number;
  notes: string;
};

export type ServiceAccessoryFormValues = {
  accessoryId: string;
  quantity: string;
  notes: string;
};

export type ServiceAccessoryFormField = "accessoryId" | "quantity" | "notes";

export type ServiceAccessoryFormErrors = Partial<Record<ServiceAccessoryFormField, string>>;

export const EMPTY_SERVICE_ACCESSORY_FORM_VALUES: ServiceAccessoryFormValues = {
  accessoryId: "",
  quantity: "1",
  notes: "",
};

export function buildServiceAccessoryWritePayload(
  serviceRecordId: number,
  values: ServiceAccessoryFormValues,
): ServiceAccessoryWritePayload {
  return {
    service_record: serviceRecordId,
    accessory: Number(values.accessoryId),
    quantity: Number(values.quantity),
    notes: values.notes.trim(),
  };
}
