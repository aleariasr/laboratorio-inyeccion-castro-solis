"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { StatePanel } from "@/components/feedback/state-panel";
import {
  AlertIcon,
  ArrowsUpDownIcon,
  BoxIcon,
  CartIcon,
  LayersIcon,
  LocationIcon,
  TruckIcon,
  UsersIcon,
} from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canReadReports } from "@/features/auth/permissions";

type ReportCard = {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
  surface: string;
};

const REPORT_CARDS: ReportCard[] = [
  {
    href: "/reports/low-stock",
    title: "Bajo mínimo",
    description:
      "Productos cuyo stock actual está por debajo del mínimo definido.",
    icon: <AlertIcon className="size-7" />,
    accent: "#b23a2e",
    surface: "#fdeeec",
  },
  {
    href: "/inventory/stock-by-location",
    title: "Stock por ubicación",
    description:
      "Existencias actuales agrupadas por ubicación de almacenamiento.",
    icon: <LocationIcon className="size-7" />,
    accent: "#075184",
    surface: "#eaf3f8",
  },
  {
    href: "/inventory/movements",
    title: "Movimientos",
    description:
      "Historial de entradas, salidas y ajustes, con kardex por producto.",
    icon: <ArrowsUpDownIcon className="size-7" />,
    accent: "#0066cc",
    surface: "#edf5ff",
  },
  {
    href: "/reports/purchases-by-supplier",
    title: "Compras por proveedor",
    description:
      "Cantidad de compras y subtotal facturado por proveedor, en colones.",
    icon: <TruckIcon className="size-7" />,
    accent: "#a05a00",
    surface: "#fff6e5",
  },
  {
    href: "/reports/product-supplier-prices",
    title: "Comparación de precios por proveedor",
    description:
      "Compare el precio pagado a cada proveedor por un mismo producto.",
    icon: <LayersIcon className="size-7" />,
    accent: "#6e4bb8",
    surface: "#f3effb",
  },
  {
    href: "/reports/sales-by-date",
    title: "Ventas por fecha",
    description:
      "Cantidad de ventas y total facturado por fecha, en colones.",
    icon: <CartIcon className="size-7" />,
    accent: "#248a3d",
    surface: "#edf8ef",
  },
  {
    href: "/reports/top-selling-products",
    title: "Productos más vendidos",
    description:
      "Cantidad vendida y total facturado por producto, en colones.",
    icon: <BoxIcon className="size-7" />,
    accent: "#0d7377",
    surface: "#e6f5f5",
  },
  {
    href: "/reports/top-customers",
    title: "Clientes con más ventas",
    description:
      "Clientes ordenados por monto total o cantidad de ventas, en colones.",
    icon: <UsersIcon className="size-7" />,
    accent: "#c02b63",
    surface: "#fceef4",
  },
];

export default function ReportsIndexPage() {
  const router = useRouter();

  const { status: authStatus, user } = useAuth();

  const hasReportsAccess = user ? canReadReports(user) : false;

  if (authStatus === "authenticated" && user && !hasReportsAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Este módulo requiere permisos de inventario o de ventas."
      >
        <StatePanel
          title="No tiene acceso a reportes"
          message="Solicite a una persona administradora que revise los permisos de su usuario."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/dashboard");
              }}
            >
              Volver al inicio
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Reportes"
      description="Información operativa para análisis y decisiones."
    >
      <section aria-labelledby="reports-title">
        <h2 id="reports-title" className="sr-only">
          Reportes disponibles
        </h2>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {REPORT_CARDS.map((report, index) => (
            <Link
              key={report.href}
              href={report.href}
              className="app-module-card block"
              style={{
                animationDelay: `${index * 55}ms`,
              }}
            >
              <div
                className="app-module-icon"
                style={{
                  background: report.surface,
                  color: report.accent,
                }}
              >
                {report.icon}
              </div>

              <div className="mt-6">
                <h3 className="text-[19px] font-semibold tracking-[-0.025em] text-foreground">
                  {report.title}
                </h3>

                <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
                  {report.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
