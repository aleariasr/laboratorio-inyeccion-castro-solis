import {
  HomeIcon,
  InventoryIcon,
  LocationIcon,
  SearchIcon,
  StatusIcon,
} from "@/components/icons/app-icons";

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
    roles: [
      "INVENTORY",
      "READ_ONLY",
    ],
  },
  {
  href: "/inventory/locations",
  label: "Ubicaciones",
  section: "inventory",
  icon: LocationIcon,
  roles: [
    "INVENTORY",
    "READ_ONLY",
  ],
},
  {
    href: "/system/status",
    label: "Estado del sistema",
    section: "administration",
    icon: StatusIcon,
    adminOnly: true,
  },
];