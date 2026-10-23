import type { DiscountType } from "@/lib/document-amounts";

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
  // El backend manda price y payment_method en null a quien no es
  // Administrador (punto 25).
  price: string | null;
  payment_method: PaymentMethod | null;
  // Descuento e impuesto al documento (punto 26); price es el subtotal.
  // Montos congelados al entregar, en vivo antes. Todo esto llega en
  // null al operario (punto 25).
  discount_type: DiscountType | null;
  discount_value: string | null;
  tax_percentage: string | null;
  subtotal: string | null;
  discount_amount: string | null;
  tax_amount: string | null;
  total: string | null;
  amounts_error: string | null;
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

// Cobro del servicio: descuento, impuesto y método de pago. El precio ya no
// se escribe: es la suma de las líneas de cobro y los accesorios (punto 3 +
// 1B del plan del 2026-10-22).
export type ServicePriceWritePayload = {
  payment_method: PaymentMethod;
  discount_type: DiscountType;
  discount_value: string;
  tax_percentage: string;
};

export type ServicePriceFormValues = {
  paymentMethod: PaymentMethod;
  discountType: DiscountType;
  discountValue: string;
  taxPercentage: string;
};

export type ServicePriceFormField =
  | "paymentMethod"
  | "discountType"
  | "discountValue"
  | "taxPercentage";

export type ServicePriceFormErrors = Partial<Record<ServicePriceFormField, string>>;

export function serviceRecordToPriceFormValues(
  serviceRecord: ServiceRecord,
): ServicePriceFormValues {
  return {
    paymentMethod: serviceRecord.payment_method ?? "CASH",
    discountType: serviceRecord.discount_type ?? "AMOUNT",
    // "1000.0000" → "1000", "13.00" → "13": así se ve en los campos.
    discountValue: String(Number(serviceRecord.discount_value ?? 0)),
    taxPercentage: String(Number(serviceRecord.tax_percentage ?? 0)),
  };
}

export function buildServicePriceWritePayload(
  values: ServicePriceFormValues,
): ServicePriceWritePayload {
  return {
    payment_method: values.paymentMethod,
    discount_type: values.discountType,
    discount_value: values.discountValue.trim() || "0",
    tax_percentage: values.taxPercentage.trim() || "0",
  };
}

// Línea de cobro (ServiceChargeLine): "Mano de obra × 1", "Limpieza × 4".
// Solo el Administrador.
export type ServiceChargeLine = {
  id: number;
  service_record: number;
  service_type: number | null;
  service_type_detail: ServiceType | null;
  description: string;
  quantity: number;
  unit_price: string;
  amount: string;
  created_at: string;
  updated_at: string;
};

export type ServiceChargeLineWritePayload = {
  service_record?: number;
  service_type?: number | null;
  description?: string;
  quantity?: number;
  unit_price?: string;
};

// Tipo de servicio: catálogo global (ServiceType)
export type ServiceType = {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
};

// Tipo de servicio completo (punto 1A del plan del 2026-10-22): precio de
// mano de obra (null para quien no es Administrador) y kit de accesorios.
export type ServiceTypeKitItem = {
  id: number;
  product: number;
  product_detail: {
    id: number;
    standard_code: string;
    own_code: string;
    name: string;
  };
  quantity: number;
};

export type ServiceTypeDetail = ServiceType & {
  default_labor_price: string | null;
  kit_items: ServiceTypeKitItem[];
  created_at: string;
  updated_at: string;
};

export type ServiceTypeFilters = {
  query: string;
  activeState: "all" | "active" | "inactive";
  page: number;
  pageSize: number;
};

export const EMPTY_SERVICE_TYPE_FILTERS: ServiceTypeFilters = {
  query: "",
  activeState: "active",
  page: 1,
  pageSize: 50,
};

export type ServiceTypeWritePayload = {
  name: string;
  description: string;
  default_labor_price?: string | null;
  kit_items?: Array<{ product: number; quantity: number }>;
  is_active?: boolean;
};

// Una fila del kit en el formulario: el producto elegido y la cantidad
// como texto (lo que se escribe).
export type ServiceTypeKitFormItem = {
  productId: number;
  standardCode: string;
  ownCode: string;
  name: string;
  quantity: string;
};

export type ServiceTypeFormValues = {
  name: string;
  description: string;
  defaultLaborPrice: string;
  kitItems: ServiceTypeKitFormItem[];
  isActive: boolean;
};

export type ServiceTypeFormField =
  | "name"
  | "description"
  | "defaultLaborPrice"
  | "kitItems"
  | "isActive";

export type ServiceTypeFormErrors = Partial<Record<ServiceTypeFormField, string>>;

export const EMPTY_SERVICE_TYPE_FORM_VALUES: ServiceTypeFormValues = {
  name: "",
  description: "",
  defaultLaborPrice: "",
  kitItems: [],
  isActive: true,
};

export function serviceTypeToFormValues(
  serviceType: ServiceTypeDetail,
): ServiceTypeFormValues {
  return {
    name: serviceType.name,
    description: serviceType.description,
    defaultLaborPrice: serviceType.default_labor_price ?? "",
    kitItems: serviceType.kit_items.map((item) => ({
      productId: item.product,
      standardCode: item.product_detail.standard_code,
      ownCode: item.product_detail.own_code,
      name: item.product_detail.name,
      quantity: String(item.quantity),
    })),
    isActive: serviceType.is_active,
  };
}

export function buildServiceTypeWritePayload(
  values: ServiceTypeFormValues,
): ServiceTypeWritePayload {
  const laborPrice = values.defaultLaborPrice.trim();

  return {
    name: values.name.trim(),
    description: values.description.trim(),
    default_labor_price: laborPrice ? laborPrice : null,
    kit_items: values.kitItems.map((item) => ({
      product: item.productId,
      quantity: Number(item.quantity),
    })),
    is_active: values.isActive,
  };
}

// Línea de accesorio utilizado en un servicio (InjectorServiceAccessory).
// El accesorio es un producto real del inventario: al agregarlo se
// descuenta stock, y al eliminarlo se revierte el movimiento.
export type ServiceAccessoryProductDetail = {
  id: number;
  standard_code: string;
  own_code: string;
  name: string;
  effective_sale_price: string | null;
};

// unit_price y amount: precio fijado al agregar el accesorio y su importe.
// Null para quien no es Administrador (punto 25).
export type ServiceAccessory = {
  id: number;
  service_record: number;
  product: number;
  product_detail: ServiceAccessoryProductDetail;
  quantity: number;
  unit_price: string | null;
  amount: string | null;
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

export type ServiceAccessoryUpdatePayload = {
  quantity?: number;
  unit_price?: string;
  notes?: string;
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
