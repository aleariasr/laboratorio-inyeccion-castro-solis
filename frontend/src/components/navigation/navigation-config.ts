import {
  HomeIcon,
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
    href: "/system/status",
    label: "Estado del sistema",
    section: "administration",
    icon: StatusIcon,
    adminOnly: true,
  },
];