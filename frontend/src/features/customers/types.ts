export type CustomerType = "PERSON" | "COMPANY";

export type Customer = {
  id: number;
  customer_type: CustomerType;
  display_name: string;
  phone: string;
  email: string;
  identification: string;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CustomerFilters = {
  query: string;
  customerType: "" | CustomerType;
  activeState: "all" | "active" | "inactive";
  page: number;
  pageSize: number;
};

export type CustomerWritePayload = {
  customer_type: CustomerType;
  display_name: string;
  phone: string;
  email: string;
  identification: string;
  notes: string;
  is_active: boolean;
};

export type CustomerFormValues = {
  customerType: CustomerType;
  displayName: string;
  phone: string;
  email: string;
  identification: string;
  notes: string;
  isActive: boolean;
};

export type CustomerFormField =
  | "customerType"
  | "displayName"
  | "phone"
  | "email"
  | "identification"
  | "notes"
  | "isActive";

export type CustomerFormErrors = Partial<Record<CustomerFormField, string>>;

export const EMPTY_CUSTOMER_FORM_VALUES: CustomerFormValues = {
  customerType: "PERSON",
  displayName: "",
  phone: "",
  email: "",
  identification: "",
  notes: "",
  isActive: true,
};

export function customerToFormValues(customer: Customer): CustomerFormValues {
  return {
    customerType: customer.customer_type,
    displayName: customer.display_name,
    phone: customer.phone,
    email: customer.email,
    identification: customer.identification,
    notes: customer.notes,
    isActive: customer.is_active,
  };
}

export function buildCustomerWritePayload(
  values: CustomerFormValues,
): CustomerWritePayload {
  return {
    customer_type: values.customerType,
    display_name: values.displayName.trim(),
    phone: values.phone.trim(),
    email: values.email.trim(),
    identification: values.identification.trim(),
    notes: values.notes.trim(),
    is_active: values.isActive,
  };
}

// Resumen de inyectores del cliente (solo lectura hasta implementar F14)
export type CustomerInjector = {
  id: number;
  injector_number: string;
  description: string;
  is_active: boolean;
};
