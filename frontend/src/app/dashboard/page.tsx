"use client";

import { AppShell } from "@/components/layout/app-shell";

type ModuleItem = {
  name: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
  surface: string;
};

function InventoryIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="size-7"
      aria-hidden="true"
    >
      <path
        d="M4.5 7.5 12 3.8l7.5 3.7L12 11.2 4.5 7.5Z"
        strokeLinejoin="round"
      />

      <path
        d="M4.5 7.5v8.8L12 20.2l7.5-3.9V7.5M12 11.2v9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SalesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="size-7"
      aria-hidden="true"
    >
      <path
        d="M5 6.2h14v12.3H5z"
        strokeLinejoin="round"
      />

      <path
        d="M8 9.2h8M8 12.2h5M8 15.2h3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CustomersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="size-7"
      aria-hidden="true"
    >
      <circle cx="9" cy="8.2" r="3.1" />

      <path
        d="M3.8 18.8c.5-3.1 2.2-4.8 5.2-4.8s4.7 1.7 5.2 4.8"
        strokeLinecap="round"
      />

      <path
        d="M15.2 6.2a2.7 2.7 0 0 1 0 5.2M16.1 14c2.4.2 3.7 1.8 4.1 4.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PurchasesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="size-7"
      aria-hidden="true"
    >
      <path
        d="M6.3 7.2h11.4l1.1 12H5.2l1.1-12Z"
        strokeLinejoin="round"
      />

      <path
        d="M9 8V6.1a3 3 0 0 1 6 0V8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ReportsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="size-7"
      aria-hidden="true"
    >
      <path
        d="M5 19V5M5 19h14"
        strokeLinecap="round"
      />

      <path
        d="m8 15 3-3 2.5 2 4.5-6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DocumentsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="size-7"
      aria-hidden="true"
    >
      <path
        d="M7 3.8h7l4 4v12.4H7V3.8Z"
        strokeLinejoin="round"
      />

      <path
        d="M14 3.8v4h4M10 12h5M10 15h5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const MODULES: ModuleItem[] = [
  {
    name: "Inventario",
    description:
      "Productos, ubicaciones, existencias y movimientos.",
    icon: <InventoryIcon />,
    accent: "#075184",
    surface: "#eaf3f8",
  },
  {
    name: "Ventas",
    description:
      "Registro y consulta de ventas.",
    icon: <SalesIcon />,
    accent: "#248a3d",
    surface: "#edf8ef",
  },
  {
    name: "Clientes e inyectores",
    description:
      "Clientes, inyectores y seguimiento de servicios.",
    icon: <CustomersIcon />,
    accent: "#6e4bb8",
    surface: "#f3effb",
  },
  {
    name: "Compras",
    description:
      "Proveedores, compras y costos.",
    icon: <PurchasesIcon />,
    accent: "#a05a00",
    surface: "#fff6e5",
  },
  {
    name: "Reportes",
    description:
      "Información operativa para análisis y decisiones.",
    icon: <ReportsIcon />,
    accent: "#0066cc",
    surface: "#edf5ff",
  },
  {
    name: "Documentos",
    description:
      "Etiquetas, catálogos y documentos internos.",
    icon: <DocumentsIcon />,
    accent: "#c02b63",
    surface: "#fceef4",
  },
];

export default function DashboardPage() {
  return (
    <AppShell
      title="Inicio"
      description="Seleccione el área en la que desea trabajar."
    >
      <section aria-labelledby="modules-title">
        <h2
          id="modules-title"
          className="sr-only"
        >
          Áreas del sistema
        </h2>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {MODULES.map((module, index) => (
            <article
              key={module.name}
              className="app-module-card"
              style={{
                animationDelay: `${index * 55}ms`,
              }}
            >
              <div
                className="app-module-icon"
                style={{
                  background: module.surface,
                  color: module.accent,
                }}
              >
                {module.icon}
              </div>

              <div className="mt-6">
                <h3 className="text-[19px] font-semibold tracking-[-0.025em] text-foreground">
                  {module.name}
                </h3>

                <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
                  {module.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}