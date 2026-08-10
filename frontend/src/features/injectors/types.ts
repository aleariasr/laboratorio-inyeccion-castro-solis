import type { CustomerSummary } from "../sales/types";

export type Injector = {
  id: number;
  customer: number;
  customer_detail: CustomerSummary;
  injector_number: string;
  description: string;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type InjectorFilters = {
  query: string;
  customerId?: number;
  activeState: "all" | "active" | "inactive";
  page: number;
  pageSize: number;
};

export type InjectorWritePayload = {
  customer: number;
  injector_number: string;
  description: string;
  notes: string;
  is_active: boolean;
};

export type InjectorFormValues = {
  customerId: string;
  injectorNumber: string;
  description: string;
  notes: string;
  isActive: boolean;
};

export type InjectorFormField =
  | "customerId"
  | "injectorNumber"
  | "description"
  | "notes"
  | "isActive";

export type InjectorFormErrors = Partial<Record<InjectorFormField, string>>;

export const EMPTY_INJECTOR_FORM_VALUES: InjectorFormValues = {
  customerId: "",
  injectorNumber: "",
  description: "",
  notes: "",
  isActive: true,
};

export function injectorToFormValues(injector: Injector): InjectorFormValues {
  return {
    customerId: String(injector.customer),
    injectorNumber: injector.injector_number,
    description: injector.description,
    notes: injector.notes,
    isActive: injector.is_active,
  };
}

export function buildInjectorWritePayload(
  values: InjectorFormValues,
): InjectorWritePayload {
  return {
    customer: Number(values.customerId),
    injector_number: values.injectorNumber.trim(),
    description: values.description.trim(),
    notes: values.notes.trim(),
    is_active: values.isActive,
  };
}
