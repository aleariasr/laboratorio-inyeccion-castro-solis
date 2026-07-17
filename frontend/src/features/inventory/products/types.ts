export type StorageLocationSummary = {
  id: number;
  code: string;
  description: string;
  is_active: boolean;
};

export type Product = {
  id: number;
  standard_code: string;
  name: string;
  description: string;
  storage_location: number;
  storage_location_detail: StorageLocationSummary;
  minimum_stock: number;
  unit_of_measure: string;
  current_stock: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductFilters = {
  query: string;
  activeState: "all" | "active" | "inactive";
  page: number;
  pageSize: number;
};

export type ProductReference = {
  id: number;
  product: number;
  product_detail: {
    id: number;
    standard_code: string;
    name: string;
    description: string;
  };
  manufacturer: string;
  reference_code: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
