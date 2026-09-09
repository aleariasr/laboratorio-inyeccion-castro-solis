export type UniversalSearchProduct = {
  id: number;
  standard_code: string;
  name: string;
  description: string;
  variant_kind: "ORIGINAL" | "GENERIC" | "OTHER";
  storage_location: {
    id: number;
    code: string;
  } | null;
};

export type UniversalSearchLocation = {
  id: number;
  code: string;
  description: string;
};

export type UniversalSearchSupplier = {
  id: number;
  name: string;
  phone: string;
  email: string;
  country: string;
};

export type UniversalSearchPurchase = {
  id: number;
  invoice_number: string;
  purchase_date: string;
  supplier: {
    id: number;
    name: string;
  };
  status: string;
};

export type UniversalSearchCustomer = {
  id: number;
  display_name: string;
  phone: string;
  email: string;
  identification: string;
};

export type UniversalSearchInjector = {
  id: number;
  injector_number: string;
  description: string;
  customer: {
    id: number;
    display_name: string;
  };
};

export type UniversalSearchResults = {
  products: UniversalSearchProduct[];
  locations: UniversalSearchLocation[];
  suppliers: UniversalSearchSupplier[];
  purchases: UniversalSearchPurchase[];
  customers: UniversalSearchCustomer[];
  injectors: UniversalSearchInjector[];
};

export type UniversalSearchResponse = {
  query: string;
  results: UniversalSearchResults;
};
