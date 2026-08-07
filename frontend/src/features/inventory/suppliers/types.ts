import type { Product } from "../products/types";

export type Supplier = {
  id: number;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  country: string;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SupplierFilters = {
  query: string;
  activeState: "all" | "active" | "inactive";
  page: number;
  pageSize: number;
};

export type SupplierWritePayload = {
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  country: string;
  notes: string;
  is_active: boolean;
};

export type SupplierFormValues = {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  country: string;
  notes: string;
  isActive: boolean;
};

export type SupplierFormField =
  | "name"
  | "contactName"
  | "phone"
  | "email"
  | "country"
  | "notes"
  | "isActive";

export type SupplierFormErrors = Partial<Record<SupplierFormField, string>>;

export const EMPTY_SUPPLIER_FORM_VALUES: SupplierFormValues = {
  name: "",
  contactName: "",
  phone: "",
  email: "",
  country: "",
  notes: "",
  isActive: true,
};

export function supplierToFormValues(
  supplier: Supplier,
): SupplierFormValues {
  return {
    name: supplier.name,
    contactName: supplier.contact_name,
    phone: supplier.phone,
    email: supplier.email,
    country: supplier.country,
    notes: supplier.notes,
    isActive: supplier.is_active,
  };
}

export function buildSupplierWritePayload(
  values: SupplierFormValues,
): SupplierWritePayload {
  return {
    name: values.name.trim(),
    contact_name: values.contactName.trim(),
    phone: values.phone.trim(),
    email: values.email.trim(),
    country: values.country.trim(),
    notes: values.notes.trim(),
    is_active: values.isActive,
  };
}

// SupplierProduct: productos asociados al proveedor

export type SupplierProduct = {
  id: number;
  supplier: number;
  supplier_detail: Supplier;
  product: number;
  product_detail: {
    id: number;
    standard_code: string;
    name: string;
    description: string;
  };
  supplier_reference: string;
  manufacturer: string;
  preferred_supplier: boolean;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SupplierProductWritePayload = {
  supplier: number;
  product: number;
  supplier_reference: string;
  manufacturer: string;
  preferred_supplier: boolean;
  notes: string;
  is_active: boolean;
};

export type SupplierProductFormValues = {
  productId: string;
  supplierReference: string;
  manufacturer: string;
  preferredSupplier: boolean;
  notes: string;
  isActive: boolean;
};

export type SupplierProductFormField =
  | "productId"
  | "supplierReference"
  | "manufacturer"
  | "preferredSupplier"
  | "notes"
  | "isActive";

export type SupplierProductFormErrors = Partial<Record<SupplierProductFormField, string>>;

export const EMPTY_SUPPLIER_PRODUCT_FORM_VALUES: SupplierProductFormValues = {
  productId: "",
  supplierReference: "",
  manufacturer: "",
  preferredSupplier: false,
  notes: "",
  isActive: true,
};

export function supplierProductToFormValues(
  supplierProduct: SupplierProduct,
): SupplierProductFormValues {
  return {
    productId: String(supplierProduct.product),
    supplierReference: supplierProduct.supplier_reference,
    manufacturer: supplierProduct.manufacturer,
    preferredSupplier: supplierProduct.preferred_supplier,
    notes: supplierProduct.notes,
    isActive: supplierProduct.is_active,
  };
}

export function buildSupplierProductWritePayload(
  supplierId: number,
  values: SupplierProductFormValues,
): SupplierProductWritePayload {
  return {
    supplier: supplierId,
    product: Number(values.productId),
    supplier_reference: values.supplierReference.trim(),
    manufacturer: values.manufacturer.trim(),
    preferred_supplier: values.preferredSupplier,
    notes: values.notes.trim(),
    is_active: values.isActive,
  };
}

// Reexportado para el combobox de producto (Paso 4)
export type { Product };
