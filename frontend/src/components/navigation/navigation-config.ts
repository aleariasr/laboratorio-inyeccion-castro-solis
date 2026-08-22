import {
  CartIcon,
  ClipboardCheckIcon,
  DropletIcon,
  HomeIcon,
  InventoryIcon,
  KeyIcon,
  LocationIcon,
  ReceiptIcon,
  ReportsIcon,
  SearchIcon,
  StatusIcon,
  TruckIcon,
  UsersIcon,
  WrenchIcon,
} from "@/components/icons/app-icons";
import {
  canReadCustomers,
  canReadInjectors,
  canReadInventoryCounts,
  canReadLocations,
  canReadProducts,
  canReadPurchases,
  canReadReports,
  canReadSales,
  canReadServices,
  canReadSuppliers,
} from "@/features/auth/permissions";

import type {
  NavigationItem,
  NavigationSection,
} from "./navigation-types";

export const NAVIGATION_SECTIONS: NavigationSection[] = [
  {
    id: "main",
    label: "Principal",
  },
  {
    id: "inventory",
    label: "Inventario",
  },
  {
    id: "sales",
    label: "Ventas",
  },
  {
    id: "customers",
    label: "Clientes y servicio",
  },
  {
    id: "reports",
    label: "Reportes",
  },
  {
    id: "documents",
    label: "Documentos",
  },
  {
    id: "administration",
    label: "Administración",
  },
];

export const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    href: "/dashboard",
    label: "Inicio",
    section: "main",
    icon: HomeIcon,
  },
  {
    href: "/search",
    label: "Búsqueda",
    section: "main",
    icon: SearchIcon,
  },
  {
    href: "/inventory/products",
    label: "Productos",
    section: "inventory",
    icon: InventoryIcon,
    permissionCheck: canReadProducts,
  },
  {
    href: "/inventory/locations",
    label: "Ubicaciones",
    section: "inventory",
    icon: LocationIcon,
    permissionCheck: canReadLocations,
  },
  {
    href: "/inventory/suppliers",
    label: "Proveedores",
    section: "inventory",
    icon: TruckIcon,
    permissionCheck: canReadSuppliers,
  },
  {
    href: "/inventory/purchases",
    label: "Compras",
    section: "inventory",
    icon: ReceiptIcon,
    permissionCheck: canReadPurchases,
  },
  {
    href: "/inventory/counts",
    label: "Conteos físicos",
    section: "inventory",
    icon: ClipboardCheckIcon,
    permissionCheck: canReadInventoryCounts,
  },
  {
    href: "/sales",
    label: "Ventas",
    section: "sales",
    icon: CartIcon,
    permissionCheck: canReadSales,
  },
  {
    href: "/customers",
    label: "Clientes",
    section: "customers",
    icon: UsersIcon,
    permissionCheck: canReadCustomers,
  },
  {
    href: "/injectors",
    label: "Inyectores",
    section: "customers",
    icon: DropletIcon,
    permissionCheck: canReadInjectors,
  },
  {
    href: "/services",
    label: "Servicios",
    section: "customers",
    icon: WrenchIcon,
    permissionCheck: canReadServices,
  },
  {
    href: "/reports",
    label: "Reportes",
    section: "reports",
    icon: ReportsIcon,
    permissionCheck: canReadReports,
  },
  {
    href: "/users",
    label: "Usuarios",
    section: "administration",
    icon: KeyIcon,
    adminOnly: true,
  },
  {
    href: "/system/status",
    label: "Estado del sistema",
    section: "administration",
    icon: StatusIcon,
    adminOnly: true,
  },
];
