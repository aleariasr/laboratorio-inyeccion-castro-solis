import type { AuthUser } from "./types";

export type AppRole =
  | "ADMIN"
  | "INVENTORY"
  | "SALES"
  | "CUSTOMERS"
  | "READ_ONLY";

export function isAdministrativeUser(
  user: AuthUser,
): boolean {
  return (
    user.is_superuser ||
    user.is_staff ||
    user.groups.includes("ADMIN")
  );
}

// Espejo exacto del bypass de ModulePermission en el backend: solo
// superusuario o el grupo ADMIN saltan el chequeo de permiso de
// modulo. A diferencia de isAdministrativeUser, is_staff NO cuenta
// aca -- is_staff solo controla el acceso al panel /admin/ de Django
// (ver AdministrationPermission), no el de los modulos de negocio.
function isModuleAdmin(user: AuthUser): boolean {
  return user.is_superuser || user.groups.includes("ADMIN");
}

export function hasAnyRole(
  user: AuthUser,
  roles: AppRole[],
): boolean {
  if (isModuleAdmin(user)) {
    return true;
  }

  return roles.some((role) =>
    user.groups.includes(role),
  );
}

export function hasModulePermission(
  user: AuthUser,
  codename: string,
): boolean {
  return user.permissions.includes(codename);
}

// --- Inventario: productos ---

export function canReadProducts(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["INVENTORY", "READ_ONLY"]) ||
    hasModulePermission(user, "view_products")
  );
}

export function canWriteProducts(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["INVENTORY"]) ||
    hasModulePermission(user, "add_products") ||
    hasModulePermission(user, "change_products")
  );
}

// --- Inventario: ubicaciones ---

export function canReadLocations(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["INVENTORY", "READ_ONLY"]) ||
    hasModulePermission(user, "view_locations")
  );
}

export function canWriteLocations(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["INVENTORY"]) ||
    hasModulePermission(user, "add_locations") ||
    hasModulePermission(user, "change_locations")
  );
}

// --- Inventario: proveedores ---

export function canReadSuppliers(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["INVENTORY", "READ_ONLY"]) ||
    hasModulePermission(user, "view_suppliers")
  );
}

export function canWriteSuppliers(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["INVENTORY"]) ||
    hasModulePermission(user, "add_suppliers") ||
    hasModulePermission(user, "change_suppliers")
  );
}

// --- Inventario: compras ---

export function canReadPurchases(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["INVENTORY", "READ_ONLY"]) ||
    hasModulePermission(user, "view_purchases")
  );
}

export function canWritePurchases(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["INVENTORY"]) ||
    hasModulePermission(user, "add_purchases") ||
    hasModulePermission(user, "change_purchases")
  );
}

// --- Inventario: conteos físicos ---

export function canReadInventoryCounts(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["INVENTORY", "READ_ONLY"]) ||
    hasModulePermission(user, "view_inventory_counts")
  );
}

export function canWriteInventoryCounts(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["INVENTORY"]) ||
    hasModulePermission(user, "add_inventory_counts") ||
    hasModulePermission(user, "change_inventory_counts")
  );
}

// --- Inventario: movimientos (solo lectura) ---

export function canReadMovements(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["INVENTORY", "READ_ONLY"]) ||
    hasModulePermission(user, "view_movements")
  );
}

// --- Ventas ---

export function canReadSales(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["SALES", "READ_ONLY"]) ||
    hasModulePermission(user, "view_sales")
  );
}

export function canWriteSales(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["SALES"]) ||
    hasModulePermission(user, "add_sales") ||
    hasModulePermission(user, "change_sales")
  );
}

export function canCancelSales(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["SALES"]) ||
    hasModulePermission(user, "cancel_sales")
  );
}

// --- Clientes y servicio: clientes ---

export function canReadCustomers(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["CUSTOMERS", "READ_ONLY"]) ||
    hasModulePermission(user, "view_customers")
  );
}

export function canWriteCustomers(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["CUSTOMERS"]) ||
    hasModulePermission(user, "add_customers") ||
    hasModulePermission(user, "change_customers")
  );
}

// --- Clientes y servicio: inyectores ---

export function canReadInjectors(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["CUSTOMERS", "READ_ONLY"]) ||
    hasModulePermission(user, "view_injectors")
  );
}

export function canWriteInjectors(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["CUSTOMERS"]) ||
    hasModulePermission(user, "add_injectors") ||
    hasModulePermission(user, "change_injectors")
  );
}

// --- Clientes y servicio: servicios ---

export function canReadServices(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["CUSTOMERS", "READ_ONLY"]) ||
    hasModulePermission(user, "view_services")
  );
}

export function canWriteServices(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["CUSTOMERS"]) ||
    hasModulePermission(user, "add_services") ||
    hasModulePermission(user, "change_services")
  );
}

export function canCancelServices(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["CUSTOMERS"]) ||
    hasModulePermission(user, "cancel_services")
  );
}

// --- Reportes ---

export function canReadReports(user: AuthUser): boolean {
  return (
    isModuleAdmin(user) ||
    hasModulePermission(user, "view_reports")
  );
}
