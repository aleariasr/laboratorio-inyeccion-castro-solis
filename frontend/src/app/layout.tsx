import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "LICS",
    template: "%s | LICS",
  },
  description:
    "Sistema interno del Laboratorio de Inyección Castro Solís.",
  applicationName: "LICS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
