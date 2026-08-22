import type { AppRole } from "@/features/auth/permissions";

export type User = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  groups: AppRole[];
  permissions: string[];
};

export type UserFilters = {
  query: string;
  activeState: "all" | "active" | "inactive";
  page: number;
  pageSize: number;
};

export type UserWritePayload = {
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
  is_staff: boolean;
  groups: AppRole[];
  permissions: string[];
};

export type UserCreatePayload = UserWritePayload & {
  username: string;
  password: string;
};

export type UserFormValues = {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  isStaff: boolean;
  groups: AppRole[];
  permissions: string[];
};

export type UserFormField =
  | "username"
  | "password"
  | "firstName"
  | "lastName"
  | "email"
  | "isActive"
  | "isStaff"
  | "groups"
  | "permissions";

export type UserFormErrors = Partial<Record<UserFormField, string>>;

export type PermissionAction = "view" | "add" | "change" | "cancel";

export type PermissionModule = {
  key: string;
  label: string;
  actions: PermissionAction[];
};

export const PERMISSION_ACTION_LABELS: Record<PermissionAction, string> = {
  view: "Ver",
  add: "Crear",
  change: "Editar",
  cancel: "Cancelar",
};

// Debe reflejar exactamente ModulePermissions.Meta.permissions en
// backend/src/apps/core/models.py: mismos módulos, mismas acciones
// disponibles por módulo, mismo orden. Si se agrega o quita una
// acción allá, hay que reflejarlo acá también.
export const PERMISSION_MODULES: PermissionModule[] = [
  { key: "products", label: "Productos", actions: ["view", "add", "change"] },
  { key: "locations", label: "Ubicaciones", actions: ["view", "add", "change"] },
  { key: "suppliers", label: "Proveedores", actions: ["view", "add", "change"] },
  { key: "purchases", label: "Compras", actions: ["view", "add", "change", "cancel"] },
  { key: "inventory_counts", label: "Conteos físicos", actions: ["view", "add", "change", "cancel"] },
  { key: "sales", label: "Ventas", actions: ["view", "add", "change", "cancel"] },
  { key: "customers", label: "Clientes", actions: ["view", "add", "change"] },
  { key: "injectors", label: "Inyectores", actions: ["view", "add", "change"] },
  { key: "services", label: "Servicios", actions: ["view", "add", "change", "cancel"] },
  { key: "reports", label: "Reportes", actions: ["view"] },
  { key: "documents", label: "Documentos", actions: ["view"] },
  { key: "movements", label: "Movimientos de inventario", actions: ["view"] },
];

export function permissionCodename(
  moduleKey: string,
  action: PermissionAction,
): string {
  return `${action}_${moduleKey}`;
}

export const EMPTY_USER_FORM_VALUES: UserFormValues = {
  username: "",
  password: "",
  firstName: "",
  lastName: "",
  email: "",
  isActive: true,
  isStaff: false,
  groups: [],
  permissions: [],
};

export function userToFormValues(user: User): UserFormValues {
  return {
    username: user.username,
    password: "",
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    isActive: user.is_active,
    isStaff: user.is_staff,
    groups: user.groups,
    permissions: user.permissions,
  };
}

export function buildUserWritePayload(values: UserFormValues): UserWritePayload {
  return {
    first_name: values.firstName.trim(),
    last_name: values.lastName.trim(),
    email: values.email.trim(),
    is_active: values.isActive,
    is_staff: values.isStaff,
    groups: values.groups,
    permissions: values.permissions,
  };
}

export function buildUserCreatePayload(values: UserFormValues): UserCreatePayload {
  return {
    ...buildUserWritePayload(values),
    username: values.username.trim(),
    password: values.password,
  };
}
