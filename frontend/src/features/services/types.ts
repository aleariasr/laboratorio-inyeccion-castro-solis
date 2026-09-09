import type { CustomerSummary, PaymentMethod } from "../sales/types";

export type { PaymentMethod };
export { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_OPTIONS } from "../sales/types";

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
  inductance: string | null;
  isolation: string | null;
  price: string | null;
  payment_method: PaymentMethod;
  service_type: number | null;
  service_type_detail: ServiceType | null;
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
  inductance: string;
  isolation: string;
  notes_before: string;
  notes_after: string;
  observations: string;
};

export type ServiceRecordTechnicalFormValues = {
  resistance: string;
  leakage: string;
  inductance: string;
  isolation: string;
  notesBefore: string;
  notesAfter: string;
  observations: string;
};

export type ServiceRecordTechnicalFormField =
  | "resistance"
  | "leakage"
  | "inductance"
  | "isolation"
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
    inductance: serviceRecord.inductance ?? "",
    isolation: serviceRecord.isolation ?? "",
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
    inductance: values.inductance.trim(),
    isolation: values.isolation.trim(),
    notes_before: values.notesBefore.trim(),
    notes_after: values.notesAfter.trim(),
    observations: values.observations.trim(),
  };
}

// Precio del servicio (tipo de servicio + precio + método de pago, en su propio cuadro)
export type ServicePriceWritePayload = {
  price: string;
  payment_method: PaymentMethod;
  service_type: number | null;
};

export type ServicePriceFormValues = {
  price: string;
  paymentMethod: PaymentMethod;
  serviceTypeId: string;
};

export type ServicePriceFormField = "price" | "paymentMethod" | "serviceTypeId";

export type ServicePriceFormErrors = Partial<Record<ServicePriceFormField, string>>;

export function serviceRecordToPriceFormValues(
  serviceRecord: ServiceRecord,
): ServicePriceFormValues {
  return {
    price: serviceRecord.price ?? "",
    paymentMethod: serviceRecord.payment_method,
    serviceTypeId: serviceRecord.service_type ? String(serviceRecord.service_type) : "",
  };
}

export function buildServicePriceWritePayload(
  values: ServicePriceFormValues,
): ServicePriceWritePayload {
  return {
    price: values.price.trim(),
    payment_method: values.paymentMethod,
    service_type: values.serviceTypeId ? Number(values.serviceTypeId) : null,
  };
}

// Tipo de servicio: catálogo global (ServiceType)
export type ServiceType = {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
};

export type ServiceTypeWritePayload = {
  name: string;
  description: string;
};

export type ServiceTypePriceHistory = {
  id: number;
  service_type: number;
  service_type_detail: ServiceType;
  service_record: number;
  price: string;
  charged_at: string;
};

// Línea de accesorio utilizado en un servicio (InjectorServiceAccessory).
// El accesorio es un producto real del inventario: al agregarlo se
// descuenta stock, y al eliminarlo se revierte el movimiento.
export type ServiceAccessoryProductDetail = {
  id: number;
  standard_code: string;
  name: string;
  effective_sale_price: string | null;
};

export type ServiceAccessory = {
  id: number;
  service_record: number;
  product: number;
  product_detail: ServiceAccessoryProductDetail;
  quantity: number;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type ServiceAccessoryWritePayload = {
  service_record: number;
  product: number;
  quantity: number;
  notes: string;
};

export type ServiceAccessoryFormValues = {
  productId: string;
  quantity: string;
  notes: string;
};

export type ServiceAccessoryFormField = "productId" | "quantity" | "notes";

export type ServiceAccessoryFormErrors = Partial<Record<ServiceAccessoryFormField, string>>;

export const EMPTY_SERVICE_ACCESSORY_FORM_VALUES: ServiceAccessoryFormValues = {
  productId: "",
  quantity: "1",
  notes: "",
};

export function buildServiceAccessoryWritePayload(
  serviceRecordId: number,
  values: ServiceAccessoryFormValues,
): ServiceAccessoryWritePayload {
  return {
    service_record: serviceRecordId,
    product: Number(values.productId),
    quantity: Number(values.quantity),
    notes: values.notes.trim(),
  };
}
