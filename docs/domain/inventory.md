# Dominio: Inventario

> Estado actualizado: el dominio de inventario ya cuenta con una implementación backend base en `0.2.0-alpha`. Este documento se mantiene como referencia técnica y conceptual, pero debe evolucionar según la validación de flujos reales desde el frontend.

## Estado

Draft

---

# Objetivo

El módulo de inventario es responsable de administrar los productos físicos del laboratorio, sus compras, proveedores, ubicaciones y existencias.

El inventario constituye la fuente de verdad para todos los demás módulos del sistema.

Los módulos de ventas, caja, producción y reportes dependen de este dominio.

---

# Principios

1. El inventario nunca se modifica manualmente.

2. Toda modificación del inventario genera un movimiento.

3. El stock nunca se almacena en la tabla Product.

4. El stock siempre se calcula a partir del historial de movimientos.

5. Toda operación debe ejecutarse mediante servicios del dominio.

6. Las consultas complejas deben implementarse mediante selectors.

7. Toda modificación debe quedar auditada.

---

# Entidades

## StorageLocation

Representa una ubicación física dentro de la bodega.

Ejemplo:

A101

B204

C015

---

## Product

Representa un tipo de pieza.

No representa existencias.

No almacena stock.

---

## ProductReference

Representa referencias comerciales equivalentes para un producto.

Ejemplos:

Bosch

Denso

NGK

SKF

---

## Supplier

Proveedor de productos.

---

## SupplierProduct

Relaciona un proveedor con un producto.

Permite registrar:

- referencia del proveedor
- fabricante
- proveedor preferido

---

## Purchase

Cabecera de una compra.

Estados:

- DRAFT
- CONFIRMED
- CANCELLED

---

## PurchaseItem

Línea de una compra.

---

## ImportCostCategory

Catálogo de costos adicionales.

Ejemplos:

- Flete
- Aduanas
- Seguro
- Transporte interno

---

## ImportCost

Costo adicional asociado a una compra.

---

## StockMovement

Fuente única de verdad del inventario.

Tipos:

- ENTRY
- EXIT
- ADJUSTMENT
- INITIAL

---

# Servicios

Actualmente existen:

- confirm_purchase()
- cancel_purchase()

Todo nuevo comportamiento deberá implementarse mediante servicios.

---

# Selectors

Actualmente existen:

- current_stock()

Toda consulta compleja deberá implementarse mediante selectors.

---

# Reglas de negocio

Una compra DRAFT puede confirmarse.

Una compra DRAFT puede anularse.

Una compra CONFIRMED no puede confirmarse nuevamente.

Una compra CONFIRMED no puede anularse.

Una compra CANCELLED no puede confirmarse.

Toda confirmación genera movimientos de inventario.

Los movimientos de inventario únicamente pueden crearse mediante servicios del dominio.

---

# Casos de uso pendientes

- Inventario inicial
- Ajuste de inventario
- Conteo físico
- Historial de movimientos
- Productos con stock bajo
- Kardex
- Valorización de inventario
- Costo promedio
- Salidas por venta
- Salidas manuales
- Transferencias entre ubicaciones

---

# Dependencias

Ventas depende de Inventario.

Caja depende de Ventas.

Reportes depende de Inventario y Ventas.

Producción dependerá de Inventario.

---

# Cambios al dominio

Toda modificación importante deberá justificarse antes de implementarse.

El modelo de datos debe evolucionar únicamente cuando exista un requerimiento funcional real.

## Estado de implementación actual

En la versión `0.2.0-alpha`, el backend ya implementa una base funcional del dominio de inventario.

Incluye:

- ubicaciones físicas;
- productos;
- referencias de producto;
- proveedores;
- referencias proveedor-producto;
- compras;
- líneas de compra;
- confirmación y anulación de compras;
- movimientos de inventario;
- validación contra stock negativo;
- cálculo de stock desde movimientos;
- costos de importación;
- resumen de costos;
- historial de costos;
- ventas;
- líneas de venta;
- confirmación y anulación de ventas;
- conteo físico;
- ajustes auditables;
- búsqueda universal;
- reportes JSON;
- etiquetas PDF con código de barras real.

Regla principal:

El stock no se edita directamente. La fuente de verdad son los movimientos de inventario.

## Documentación relacionada

- [README principal](../../README.md)
- [Índice de documentación](../index.md)
- [Cierre de backend base](../backend-base-closure.md)
- [Modelo de datos](../data-model.md)
- [Roadmap](../roadmap.md)
- [Lista de preparación para producción](../production-readiness-checklist.md)
