export type StorageLocation = {
  id: number;
  code: string;
  description: string;
  is_active: boolean;
};

export type StorageLocationSummary =
  StorageLocation;

export type StorageLocationFilters = {
  query: string;
  activeState:
    | "all"
    | "active"
    | "inactive";
  page: number;
  pageSize: number;
};

export type StorageLocationWritePayload = {
  code: string;
  description: string;
  is_active: boolean;
};

export type StorageLocationFormValues = {
  code: string;
  description: string;
  isActive: boolean;
};

export type StorageLocationFormField =
  | "code"
  | "description"
  | "isActive";

export type StorageLocationFormErrors =
  Partial<
    Record<
      StorageLocationFormField,
      string
    >
  >;

export const EMPTY_STORAGE_LOCATION_FORM_VALUES:
  StorageLocationFormValues = {
    code: "",
    description: "",
    isActive: true,
  };

export function storageLocationToFormValues(
  location: StorageLocation,
): StorageLocationFormValues {
  return {
    code: location.code,
    description: location.description,
    isActive: location.is_active,
  };
}

export function buildStorageLocationWritePayload(
  values: StorageLocationFormValues,
): StorageLocationWritePayload {
  return {
    code: values.code.trim().toUpperCase(),
    description: values.description.trim(),
    is_active: values.isActive,
  };
}